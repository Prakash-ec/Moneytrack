import json, re, sys
sys.stdout.reconfigure(encoding='utf-8')

with open('backups/device_queue_backups/sms_transaction_queue_backup_20261107_202812.json', 'r', encoding='utf-8-sig') as f:
    data = json.load(f)

records = data['records']

def is_masked_acct(val):
    if not val: return False
    u = val.upper()
    return 'X' in u or '*' in u or u.startswith("A/C")

def is_data_or_promo(r):
    p = r['parsed']
    amt = p.get('amountPaise')
    if amt is None or amt <= 0:
        return True, "NO_AMOUNT"
    sender = p.get('sender', '')
    if sender.endswith('-P') or sender.endswith('_P'):
        return True, "PROMO_SENDER"
    if amt in [500, 29900] and 'JIOCPN' in sender:
        return True, "PROMO_JIOCPN"
    if amt in [150, 1921, 9744, 8013, 1581] and 'JioPay' in sender:
        return True, "DATA_QUOTA"
    return False, None

valid = []
for i, r in enumerate(records):
    drop, reason = is_data_or_promo(r)
    if drop:
        # print(f"Quarantine [{i+1}]: {reason}")
        continue
    # Clean masked acct from ref
    p = dict(r['parsed'])
    ref = p.get('reference')
    if ref and is_masked_acct(ref):
        p['reference'] = None
        p['accountSuffix'] = "".join([c for c in ref if c.isdigit()])[-4:]
    r_clean = dict(r)
    r_clean['parsed'] = p
    valid.append(r_clean)

print(f"Total initial: {len(records)}")
print(f"Total after quarantine: {len(valid)}")

# Deduplication / Reconciliation
final_queue = []
for r in valid:
    p = r['parsed']
    amt = p.get('amountPaise')
    ref = p.get('reference')
    date = p.get('transactionDate')
    acct = p.get('accountSuffix')
    sender = p.get('sender', '')

    matched = False
    for ex in final_queue:
        ep = ex['parsed']
        e_amt = ep.get('amountPaise')
        e_ref = ep.get('reference')
        e_date = ep.get('transactionDate')
        e_acct = ep.get('accountSuffix')
        e_sender = ep.get('sender', '')

        # Layer B: ref match
        if ref and e_ref and ref.upper() == e_ref.upper():
            matched = True
            break
        # Layer C: SDCCBL CBS + UPI
        if 'SDCCBL' in sender and 'SDCCBL' in e_sender and amt == e_amt and date == e_date:
            matched = True
            if ref and not e_ref:
                ep['reference'] = ref
            break
        # Layer D: JioPay recharge duplicate
        if 'JioPay' in sender and 'JioPay' in e_sender and amt == e_amt and date == e_date:
            matched = True
            break

    if not matched:
        final_queue.append(r)

print(f"Final reconciled transactions count: {len(final_queue)}")
for i, f in enumerate(final_queue):
    p = f['parsed']
    print(f"[{i+1}] Date: {p.get('transactionDate')} | Amt: Rs.{p.get('amountPaise')/100:.2f} | Status: {p.get('status')} | Ref: {p.get('reference')} | Sender: {p.get('sender')}")

import json, re, sys, hashlib
sys.stdout.reconfigure(encoding='utf-8')

with open('scripts/device_current_queue.json', 'r', encoding='utf-8-sig') as f:
    data = json.load(f)

records = data['records']
print(f"==================================================")
print(f"MONEYTRACK REAL-DEVICE QUEUE RECONCILIATION")
print(f"Initial raw records on device: {len(records)}")
print(f"==================================================")

DATA_QUOTA_AMOUNTS = [150, 1921, 9744, 8013, 1581]
PROMO_AMOUNTS = [500, 29900]

quarantined = []
valid = []

def is_masked_acct(val):
    if not val: return False
    u = val.upper()
    return 'X' in u or '*' in u or u.startswith("A/C")

for i, r in enumerate(records):
    p = r['parsed']
    amt = p.get('amountPaise')
    sender = p.get('sender', '')
    sender_upper = sender.upper()
    ev = p.get('evidence', '').lower()
    
    # 1. Non-financial checks
    is_quota = (amt in DATA_QUOTA_AMOUNTS and ('JIO' in sender_upper or 'JIOPAY' in sender_upper)) or \
               ('quota' in ev or 'data balance' in ev or 'டேட்டா' in ev)
    is_promo = (sender_upper.endswith('-P') or sender_upper.endswith('_P')) or \
               (amt in PROMO_AMOUNTS and 'CPN' in sender_upper) or \
               ('audible' in ev or 'coupon' in ev)
    no_amt = amt is None or amt <= 0
    
    if is_quota:
        quarantined.append((i+1, "DATA_QUOTA", sender, amt, ev[:50]))
    elif is_promo:
        quarantined.append((i+1, "PROMOTIONAL", sender, amt, ev[:50]))
    elif no_amt:
        quarantined.append((i+1, "NO_AMOUNT", sender, amt, ev[:50]))
    else:
        # Clean record
        p_clean = dict(p)
        ref = p_clean.get('reference')
        if ref and is_masked_acct(ref):
            p_clean['reference'] = None
            digits = "".join([c for c in ref if c.isdigit()])
            p_clean['accountSuffix'] = digits[-4:] if len(digits) >= 4 else digits

        # Extract available balance from evidence preview if missing
        ev_raw = p.get('evidence', '')
        bal_m = re.search(r'(?:Total\s*Balance\s*:\s*Rs\.?\s*|Clear\s*Balance\s*:\s*Rs\.?\s*|Avail\s*Bal:\s*Rs\.?\s*)([0-9,]+(?:\.[0-9]{2})?)', ev_raw, re.IGNORECASE)
        if bal_m:
            try:
                bal_val = float(bal_m.group(1).replace(',', ''))
                p_clean['availableBalancePaise'] = round(bal_val * 100)
            except:
                pass
        
        # Ensure bankName is populated
        if 'SDCCBL' in sender_upper or 'SDCCB' in sender_upper:
            p_clean['bankName'] = "Salem District Central Co-operative Bank"
            if not p_clean.get('accountSuffix'):
                p_clean['accountSuffix'] = "4375"
                
        r_clean = dict(r)
        r_clean['parsed'] = p_clean
        valid.append(r_clean)

print(f"\nQuarantined false positives: {len(quarantined)}")
for q in quarantined:
    print(f"  - Record #{q[0]}: [{q[1]}] sender={q[2]} amt={q[3]} | {q[4]}")

print(f"\nRemaining candidate financial records: {len(valid)}")

# Layer A, B, C, D Reconciliation
reconciled = []
merged_count = 0

for r in valid:
    p = r['parsed']
    amt = p.get('amountPaise')
    ref = p.get('reference')
    date = p.get('transactionDate')
    sender = p.get('sender', '')
    status = p.get('status')
    
    matched_idx = -1
    matched_layer = None
    
    for idx, ex in enumerate(reconciled):
        ep = ex['parsed']
        e_amt = ep.get('amountPaise')
        e_ref = ep.get('reference')
        e_date = ep.get('transactionDate')
        e_sender = ep.get('sender', '')
        e_status = ep.get('status')
        
        # Layer B: Matching UPI reference
        if ref and e_ref and ref.upper() == e_ref.upper():
            matched_idx = idx
            matched_layer = "B (UPI Reference Match)"
            break
            
        # Layer C: SDCCBL CBS Ledger + UPI Alert (same bank, account 4375, date, amount, status)
        conflicting_ref = (ref and e_ref and ref.upper() != e_ref.upper())
        if 'SDCCBL' in sender.upper() and 'SDCCBL' in e_sender.upper() and amt == e_amt and date == e_date and status == e_status and not conflicting_ref:
            matched_idx = idx
            matched_layer = "C (Bank CBS/UPI Dual Notification)"
            break
            
        # Layer D: Cross-source recharge (JioPay recharge confirmation + Bank debit)
        is_recharge = 'JioPay' in sender or 'Recharge' in (p.get('categorySuggestion') or '')
        e_is_recharge = 'JioPay' in e_sender or 'Recharge' in (ep.get('categorySuggestion') or '')
        if (is_recharge or e_is_recharge) and amt == e_amt and date == e_date and status == e_status:
            matched_idx = idx
            matched_layer = "D (Recharge Cross-Source Match)"
            break

    if matched_idx >= 0:
        merged_count += 1
        # Merge metadata
        ex = reconciled[matched_idx]
        ep = ex['parsed']
        best_ref = ep.get('reference') or ref
        best_bal = ep.get('availableBalancePaise') or p.get('availableBalancePaise')
        best_merchant = ep.get('merchant') or p.get('merchant') or ("Jio" if 'Jio' in sender else "Salem District Central Co-operative Bank")
        best_cat = "Mobile Recharge" if (is_recharge or e_is_recharge) else ep.get('categorySuggestion')
        
        ep['reference'] = best_ref
        ep['availableBalancePaise'] = best_bal
        ep['merchant'] = best_merchant
        if best_cat:
            ep['categorySuggestion'] = best_cat
        ex['reason'] = f"Reconciled via Layer {matched_layer}"
    else:
        # Re-compute robust ID
        clean_ref = ref if (ref and not is_masked_acct(ref)) else None
        clean_amt = str(amt)
        clean_sender = sender.split('-')[1] if '-' in sender else sender
        fingerprint_key = f"ref:{clean_sender}:{clean_ref}:{clean_amt}" if clean_ref else f"fallback:{clean_sender}:4375:{date}:{clean_amt}"
        r['id'] = hashlib.sha256(fingerprint_key.encode('utf-8')).hexdigest()
        reconciled.append(r)

print(f"\nMerged dual/duplicate notifications: {merged_count}")
print(f"Final unique verified financial transactions: {len(reconciled)}")
print(f"==================================================")

for i, r in enumerate(reconciled):
    p = r['parsed']
    amt_inr = p.get('amountPaise', 0) / 100.0
    bal_inr = (p.get('availableBalancePaise') or 0) / 100.0
    ref_str = p.get('reference') or "None (CBS)"
    date_str = p.get('transactionDate') or "Recent"
    status_str = p.get('status')
    sender_str = p.get('sender')
    print(f"[{i+1:02d}] {date_str} | {status_str:6} | ₹{amt_inr:8.2f} | Ref: {ref_str:14} | Bal: ₹{bal_inr:9.2f} | {sender_str}")

# Save cleaned queue
output_data = {"records": reconciled}
with open('scripts/cleaned_device_queue.json', 'w', encoding='utf-8') as f:
    json.dump(output_data, f, indent=2, ensure_ascii=False)

print(f"\nCleaned queue written to scripts/cleaned_device_queue.json")

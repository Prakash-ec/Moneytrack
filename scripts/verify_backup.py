import json, re, sys
sys.stdout.reconfigure(encoding='utf-8')

with open('backups/device_queue_backups/sms_transaction_queue_backup_20261107_202812.json', 'r', encoding='utf-8-sig') as f:
    data = json.load(f)

records = data['records']
print(f"Total records in backup: {len(records)}")

for i, r in enumerate(records):
    p = r['parsed']
    ev = p.get('evidence', '')
    amt = p.get('amountPaise')
    status = p.get('status')
    ref = p.get('reference')
    sender = p.get('sender')
    print(f"[{i+1}] amt={amt} status={status} ref={ref} sender={sender} ev={ev[:60]}")

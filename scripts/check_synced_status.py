import json, sys
sys.stdout.reconfigure(encoding='utf-8')

with open('scripts/device_verified_queue.json', 'r', encoding='utf-8-sig') as f:
    data = json.load(f)

records = data['records']
for i, r in enumerate(records):
    p = r['parsed']
    print(f"[{i+1:02d}] id={r['id'][:12]} status={r['status']} syncedAt={r.get('syncedAtMs')} err={r.get('error')} amt={p.get('amountPaise')/100.0} ref={p.get('reference')}")

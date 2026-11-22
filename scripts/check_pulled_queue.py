import json, sys
sys.stdout.reconfigure(encoding='utf-8')

with open('scripts/device_current_queue.json', 'r', encoding='utf-8-sig') as f:
    text = f.read().strip()

data = json.loads(text)
records = data['records']
print(f"Total records pulled from phone: {len(records)}")
for i, r in enumerate(records[:10]):
    p = r['parsed']
    print(f"[{i+1}] status={r['status']} amt={p.get('amountPaise')} sender={p.get('sender')} ref={p.get('reference')}")

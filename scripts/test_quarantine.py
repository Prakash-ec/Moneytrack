import json, re, sys
sys.stdout.reconfigure(encoding='utf-8')

with open('backups/device_queue_backups/sms_transaction_queue_backup_20261107_202812.json', 'r', encoding='utf-8-sig') as f:
    data = json.load(f)

records = data['records']

DATA_QUOTA_KEYWORDS = [
    "quota of", "daily data quota", "exhausted", "data balance",
    "டேட்டா பயன்பாட்டு", "டேட்டாவில்", "அதிவேக இணையத்தை",
    "data pack expired", "from your data balance", "used 19.21 mb", "used 97.44 mb", "used 80.13 mb"
]

def is_promotional(sender, text):
    sender_upper = (sender or "").upper()
    if sender_upper.endswith("-P") or sender_upper.endswith("_P"):
        return True
    text_lower = text.lower()
    for kw in ["you've earned audible", "unlimited 5g", "flat 50% off", "cashback offer", "lucky winner", "win cash"]:
        if kw in text_lower:
            return True
    return False

def is_data_quota(text):
    text_lower = text.lower()
    for kw in DATA_QUOTA_KEYWORDS:
        if kw in text_lower:
            return True
    return False

for i, r in enumerate(records):
    p = r['parsed']
    ev = p.get('evidence', '')
    sender = p.get('sender', '')
    # Check
    promo = is_promotional(sender, ev)
    data_q = is_data_quota(ev)
    amt = p.get('amountPaise')
    status = p.get('status')
    ref = p.get('reference')
    
    label = "VALID"
    if promo:
        label = "PROMO_QUARANTINE"
    elif data_q:
        label = "DATA_QUARANTINE"
    elif amt is None or amt <= 0:
        label = "NO_AMOUNT_QUARANTINE"
        
    print(f"[{i+1}] {label:22} | sender={sender:15} | amt={amt} | ref={ref}")

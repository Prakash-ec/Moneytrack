import re, sys
sys.stdout.reconfigure(encoding='utf-8')

with open('scripts/device_sms_raw.txt', 'r', encoding='utf-8') as f:
    text = f.read()

entries = [e for e in text.split("Row: ") if e.strip()]

# Let's filter entries from bank or jio
financial_entries = []
for e in entries:
    lower = e.lower()
    if any(k in lower for k in ["sdccb", "debited", "credited", "recharge successful", "jiopay", "jiocpn"]):
        # Extract fields
        addr_m = re.search(r"address=([^,\n]+)", e)
        date_m = re.search(r"date=([^,\n]+)", e)
        body_m = re.search(r"body=(.*)", e, re.DOTALL)
        addr = addr_m.group(1) if addr_m else ""
        date = date_m.group(1) if date_m else ""
        body = body_m.group(1).strip() if body_m else ""
        financial_entries.append((date, addr, body))

print(f"Total matching entries: {len(financial_entries)}")
for i, (d, a, b) in enumerate(financial_entries[:35]):
    # one line body
    b_single = b.replace("\n", " ").replace("\r", " ")
    print(f"[{i+1}] addr={a:15} | body={b_single[:90]}")

import sys, re
sys.stdout.reconfigure(encoding='utf-8')

with open('scripts/device_sms_raw.txt', 'r', encoding='utf-8') as f:
    lines = f.readlines()

print(f"Total lines in raw SMS dump: {len(lines)}")
entries = []
current = []
for line in lines:
    if line.startswith("Row: "):
        if current:
            entries.append("".join(current))
            current = []
    current.append(line)
if current:
    entries.append("".join(current))

print(f"Total SMS entries parsed from content provider: {len(entries)}")
for i, entry in enumerate(entries[:15]):
    print(f"\n--- SMS #{i+1} ---")
    print(entry.strip()[:300])

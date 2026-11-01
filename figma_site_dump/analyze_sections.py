import sys, re
sys.stdout.reconfigure(encoding='utf-8')

with open('figma_site_dump/formatted_bundle.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

print("Total lines in formatted bundle:", len(lines))

# Search for component names, function definitions, routes, state
keywords = ['Navigation', 'Sidebar', 'Header', 'Overview', 'Dashboard', 'Expenses', 'Breakdown', 'Trends', 'Categories', 'Types', 'Scanner', 'SMS', 'Settings', 'Modal']

found_sections = []
for i, line in enumerate(lines):
    if any(k.lower() in line.lower() for k in keywords):
        for k in keywords:
            if re.search(r'\b' + k + r'\b', line, re.IGNORECASE):
                found_sections.append((i, k, line.strip()[:100]))
                break

print(f"Found {len(found_sections)} relevant lines. Sample:")
for idx, k, text in found_sections[:40]:
    print(f"L{idx:5d} [{k}]: {text}")

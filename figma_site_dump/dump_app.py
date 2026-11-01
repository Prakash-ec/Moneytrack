import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('figma_site_dump/formatted_bundle.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

app_lines = lines[12300:]
with open('figma_site_dump/app_source.js', 'w', encoding='utf-8') as f:
    f.writelines(app_lines)

print("App source dumped:", len(app_lines), "lines")

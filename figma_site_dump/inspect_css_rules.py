import sys, re
sys.stdout.reconfigure(encoding='utf-8')

with open('figma_site_dump/index-BpLMO8qj.css', 'r', encoding='utf-8') as f:
    css = f.read()

# Let's find where custom styles begin
# Look for .app-shell, .sidebar, .card, etc.
rules = re.findall(r'(\.[a-zA-Z0-9_\-\s\:\,\>\+\~\.\#\[\]\=\"\*\^]+)\{([^}]+)\}', css)
print(f"Total CSS rules found: {len(rules)}")

# Let's write out formatted CSS to figma_site_dump/formatted_css.css
formatted_css = css.replace('{', ' {\n  ').replace('}', '\n}\n').replace(';', ';\n  ')
with open('figma_site_dump/formatted_css.css', 'w', encoding='utf-8') as f:
    f.write(formatted_css)

print("Formatted CSS saved. Sample rules:")
for sel, body in rules[:30]:
    if any(k in sel for k in ['app-shell', 'sidebar', 'card', 'stat', 'btn', 'button', 'nav', 'table', 'modal', 'header']):
        print(f"{sel} {{ {body[:80]}... }}")

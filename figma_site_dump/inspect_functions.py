import sys, re
sys.stdout.reconfigure(encoding='utf-8')

with open('figma_site_dump/app_source.js', 'r', encoding='utf-8') as f:
    code = f.read()

# Let's find every function and its first ~20 lines
pattern = re.compile(r'function\s+([A-Za-z0-9_]+)\s*\(([^)]*)\)\s*\{')
matches = list(pattern.finditer(code))

for i, m in enumerate(matches):
    start = m.start()
    end = matches[i+1].start() if i+1 < len(matches) else len(code)
    func_body = code[start:end]
    first_few_lines = '\n'.join([line.strip() for line in func_body.splitlines()[:15]])
    name = m.group(1)
    params = m.group(2)
    # Search for identifiers, titles, routes in this function
    titles = re.findall(r'title:`([^`]+)`', func_body) + re.findall(r'title:"([^"]+)"', func_body)
    eyebrows = re.findall(r'eyebrow:`([^`]+)`', func_body)
    paths = re.findall(r'path:\s*[`"]([^`"]+)[`"]', func_body)
    labels = re.findall(r'label:\s*[`"]([^`"]+)[`"]', func_body)
    print(f"=== Function {name}({params}) [length {len(func_body)}] ===")
    if titles: print("  Titles:", titles[:5])
    if eyebrows: print("  Eyebrows:", eyebrows[:5])
    if paths: print("  Paths:", paths[:5])
    if labels: print("  Labels:", labels[:5])
    print(first_few_lines[:300])
    print()

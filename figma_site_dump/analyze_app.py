import sys, re
sys.stdout.reconfigure(encoding='utf-8')

with open('figma_site_dump/app_source.js', 'r', encoding='utf-8') as f:
    text = f.read()

# Let's find all function components, routes, icons, CSS classes
print("=== APP SOURCE OVERVIEW ===")
# Look for function definitions
funcs = re.findall(r'function\s+([A-Za-z0-9_]+)\s*\(([^)]*)\)\s*\{', text)
print(f"Functions defined: {len(funcs)}")
for name, params in funcs:
    print(f"  function {name}({params})")

# Let's search for CSS classes used in className=`...`
classes = set(re.findall(r'className:`([^`]+)`', text))
classes.update(re.findall(r'className:"([^"]+)"', text))
print(f"\nUnique CSS classes used in JSX: {len(classes)}")
for c in sorted(classes):
    print(f"  .{c}")

import re

with open('figma_site_dump/index-DU0wbzh9.js', 'r', encoding='utf-8') as f:
    js = f.read()

# Let's find component names or functions or objects
# Search for nav items or tabs
print("Searching for Navigation items...")
nav_matches = re.findall(r'(\{[^\{\}]{0,100}(?:Dashboard|Expenses|Analytics|Categories|Settings|Trends|Breakdown)[^\{\}]{0,100}\})', js, re.IGNORECASE)
for m in nav_matches[:15]:
    print("NAV MATCH:", m)

print("\nSearching for page titles or headers...")
headers = re.findall(r'(\b(?:Dashboard|Expenses|Expense Types|Categories|Breakdown|Trends|Settings|Receipt Scanner|SMS Review|SMS Inbox|New Expense|Edit Expense|Scan Receipt)\b)', js)
print("Unique headers:", set(headers))

# Let's search for SVG icons or paths in js
svgs = re.findall(r'(<svg[^>]*>.*?</svg>)', js)
print("Inline SVGs count:", len(svgs))

# Let's find all JSX / HTML tag patterns like className="..."
class_names = re.findall(r'className:\s*["\']([^"\']+)["\']', js)
print("ClassNames count:", len(class_names))
common_classes = sorted(set(class_names))
print("Sample unique classNames:")
for c in common_classes[:40]:
    print(" ", c)

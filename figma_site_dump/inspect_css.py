with open('figma_site_dump/index-BpLMO8qj.css', 'r', encoding='utf-8') as f:
    css = f.read()

import re
# print root variables
root_match = re.search(r':root[^\{]*\{([^}]+)\}', css)
if root_match:
    print('ROOT VARS in :root:')
    for line in root_match.group(1).split(';'):
        print(' ', line.strip())

# print all custom properties --...
all_vars = re.findall(r'(--[a-zA-Z0-9_-]+:[^;{}]+)', css)
print('\nALL UNIQUE VARS:')
for v in sorted(set(all_vars)):
    if not v.startswith('--tw'):
        print(' ', v)

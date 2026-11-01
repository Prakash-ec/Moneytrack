import re
import os

with open('figma_site_dump/index-DU0wbzh9.js', 'r', encoding='utf-8') as f:
    js = f.read()

with open('figma_site_dump/index-BpLMO8qj.css', 'r', encoding='utf-8') as f:
    css = f.read()

print('=== CSS ANALYSIS ===')
print('CSS Length:', len(css))
# Check root variables
root_vars = re.findall(r'--[a-zA-Z0-9_-]+:[^;]+;', css)
print('CSS Variables count:', len(root_vars))
for var in root_vars[:30]:
    print('  ', var)

# Check fonts
font_faces = re.findall(r'@font-face\s*\{[^}]+\}', css)
print('Font faces:', len(font_faces))
for ff in font_faces:
    print('  ', ff)

print('\n=== JS ANALYSIS ===')
print('JS Length:', len(js))
source_maps = [line for line in js.splitlines() if 'sourceMappingURL' in line]
print('Source maps:', source_maps)

# Let's search for route definitions, components, color tokens, libraries
routes = re.findall(r'path:\s*["\']([^"\']+)["\']', js)
print('Routes found:', set(routes))

# Check Lucide icons or similar
icons = re.findall(r'createLucideIcon\("([^"]+)"', js)
print('Lucide icons count:', len(icons), 'sample:', icons[:10])

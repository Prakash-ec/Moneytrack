import sys, re
sys.stdout.reconfigure(encoding='utf-8')

with open('figma_site_dump/index-DU0wbzh9.js', 'r', encoding='utf-8') as f:
    js = f.read()

# Simple JS formatter to make it human readable
formatted = js
# insert newlines after semicolons and braces
formatted = formatted.replace(';}', ';\n}')
formatted = formatted.replace('{', '{\n')
formatted = formatted.replace('}', '\n}\n')
formatted = formatted.replace(';', ';\n')

with open('figma_site_dump/formatted_bundle.js', 'w', encoding='utf-8') as f:
    f.write(formatted)

print("Formatted bundle written:", len(formatted), "bytes")

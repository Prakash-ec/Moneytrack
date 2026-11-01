with open('figma_site_dump/index-BpLMO8qj.css', 'r', encoding='utf-8') as f:
    css = f.read()

print("CSS length:", len(css))
# Print the CSS with nice formatting to a reference file so we can view it cleanly
with open('figma_site_dump/complete_clean_figma.css', 'w', encoding='utf-8') as f:
    f.write(css)

import sys, re
sys.stdout.reconfigure(encoding='utf-8')

with open('figma_site_dump/formatted_css.css', 'r', encoding='utf-8') as f:
    css = f.read()

# Let's inspect root tokens and all the primary UI classes
selectors = [
    ':root', '.dark', '.app-shell', '.sidebar', '.desktop-nav', '.nav-item',
    '.topbar', '.app-main', '.page', '.page-header', '.eyebrow', '.page-actions',
    '.button', '.button-primary', '.button-secondary', '.button-ghost', '.button-danger',
    '.badge', '.badge-neutral', '.badge-positive', '.badge-warning', '.badge-danger', '.badge-primary',
    '.card', '.card-header', '.stat-card', '.stat-label', '.stat-value', '.stat-detail', '.stat-icon', '.stat-grid',
    '.period-picker', '.modal-backdrop', '.modal', '.modal-header', '.form-grid', '.field', '.modal-actions',
    '.filter-bar', '.search-field', '.segmented', '.transaction-row', '.type-card', '.settings-section', '.setting-row',
    '.empty-state', '.fab', '.mobile-nav'
]

print("Extracting exact rules from figma CSS...")
for sel in selectors:
    # regex to find selector block
    # pattern: escape selector
    esc_sel = re.escape(sel)
    matches = re.findall(r'(' + esc_sel + r'[^{]*\{[^}]+\})', css)
    for m in matches:
        print(m.strip())
        print()

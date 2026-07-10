path = "lib/theme/validateTheme.ts"

with open(path, "r") as f:
    content = f.read()

old = "'ul', 'ol', 'li', 'section', 'header', 'footer', 'nav', 'button',"
new = "'ul', 'ol', 'li', 'section', 'header', 'footer', 'nav', 'main', 'button',"

if old not in content:
    print("ERROR: line not found")
else:
    content = content.replace(old, new)
    with open(path, "w") as f:
        f.write(content)
    print("SUCCESS: main tag added to allowlist")

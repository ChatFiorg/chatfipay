path = "app/api/store/[slug]/theme/route.ts"

with open(path, "r") as f:
    content = f.read()

old = '''    await db.collection("stores").doc(slug).update({
      "theme.type": "custom",
      "theme.html": result.sanitizedHtml,
      "theme.css": result.sanitizedCss,
      "theme.updatedAt": Timestamp.now(),
    });'''

new = '''    await db.collection("stores").doc(slug).update({
      "customTheme.html": result.sanitizedHtml,
      "customTheme.css": result.sanitizedCss,
      "customTheme.updatedAt": Timestamp.now(),
    });'''

if old not in content:
    print("ERROR: block not found")
else:
    content = content.replace(old, new)
    with open(path, "w") as f:
        f.write(content)
    print("SUCCESS: renamed to customTheme")

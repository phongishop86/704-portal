# Tạo dist/704-assets-offline.html: giao diện thật (public/app.html) + máy chủ mini trong trình duyệt + dữ liệu mẫu.
# Chạy sau build-app.py:  python3 -I client/build-standalone.py [seed.json]
import json, pathlib, sys
root = pathlib.Path(__file__).resolve().parent.parent
app = (root / "public" / "app.html").read_text(encoding="utf8")
shim = (root / "client" / "standalone-server.js").read_text(encoding="utf8")
seed_path = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else root / "demo" / "demo-backup.json"
seed = json.loads(seed_path.read_text(encoding="utf8"))
seed.pop("session", None)
seed_json = json.dumps(seed, ensure_ascii=False).replace("</", "<\\/")
inject = f'<script type="application/json" id="a704-seed">{seed_json}</script>\n<script>\n{shim}\n</script>\n'
i = app.lower().find("<head>")
assert i >= 0, "không thấy <head>"
out = app[: i + 6] + "\n" + inject + app[i + 6:]
import base64, re
for m in set(re.findall(r'/img/[A-Za-z0-9_.-]+', out)):
    f = root / "public" / m.lstrip("/")
    if f.exists():
        out = out.replace(m, "data:image/png;base64," + base64.b64encode(f.read_bytes()).decode())
out = re.sub(r'<link rel="manifest"[^>]*>\n?', "", out)
d = root / "dist"; d.mkdir(exist_ok=True)
(d / "704-assets-offline.html").write_text(out, encoding="utf8")
print("OK", d / "704-assets-offline.html", len(out))

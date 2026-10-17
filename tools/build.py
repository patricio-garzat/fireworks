#!/usr/bin/env python3
"""Arma index.html (un solo archivo, como los demás juegos del estudio) a partir de src/.

Uso: python3 tools/build.py [versión]
- Mete style.css y todos los js/ (en el orden de las etiquetas <script>) dentro del HTML.
- Inserta la versión (window.APP_VERSION) que se ve en Ajustes. Sin argumento, usa el archivo VERSION.
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "src"

version = (sys.argv[1] if len(sys.argv) > 1 else (ROOT / "VERSION").read_text().strip())
(ROOT / "VERSION").write_text(version + "\n")

html = (SRC / "index.html").read_text()
css = (SRC / "style.css").read_text()
html = html.replace('<link rel="stylesheet" href="style.css">', "<style>\n" + css + "</style>")
html = html.replace('href="../brand/', 'href="brand/')

scripts = re.findall(r'<script src="(js/[^"]+)"></script>\n?', html)
code = [f'window.APP_VERSION = "{version}";']
for s in scripts:
    code.append(f"/* ---------- {s} ---------- */\n" + (SRC / s).read_text())
first = html.index(f'<script src="{scripts[0]}"></script>')
html = re.sub(r'<script src="js/[^"]+"></script>\n?', "", html)
html = html[:first] + "<script>\n" + "\n".join(code) + "</script>\n" + html[first:]

(ROOT / "index.html").write_text(html)
print(f"index.html {version}: {len(html) // 1024} KB, {len(scripts)} scripts")

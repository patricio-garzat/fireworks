"""Genera los íconos de la app (1024×1024, sin transparencia) a partir de ../../brand/favicon.svg.

- AppIcon: el mismo dibujo del favicon (cielo de medianoche con un estallido dorado), a sangre:
  sin esquinas redondeadas, porque iOS les pone su propia máscara.
- AppIcon-Dev: igual, con una franja dorada "DEV" abajo (para "Fireworks Dev", la de dev-install.sh).

Se renderiza con Chrome sin ventana, como las imágenes del estudio. Uso: python3 tools/make-icons.py
"""
import os
import re
import subprocess
import tempfile

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(HERE, "..")
SVG = os.path.join(APP, "..", "brand", "favicon.svg")
ASSETS = os.path.join(APP, "ios", "App", "App", "Assets.xcassets")
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

svg = open(SVG, encoding="utf-8").read()
svg = svg.replace(' rx="14"', "")  # a sangre: iOS redondea las esquinas
assert ' rx="' not in svg
svg = re.sub(r"<svg ", '<svg width="1024" height="1024" ', svg, count=1)

DEV = """<div class="dev">DEV</div>"""
PAGE = """<!doctype html><meta charset="utf-8"><style>
html, body {{ margin: 0; width: 1024px; height: 1024px; overflow: hidden; background: #050916; }}
svg {{ display: block; }}
.dev {{ position: absolute; left: 0; right: 0; bottom: 0; height: 205px; background: #F1C27A; color: #04060F;
  font: 700 128px/205px -apple-system, "SF Pro Display", "Helvetica Neue", sans-serif; letter-spacing: 6px; text-align: center; }}
</style>{svg}{dev}"""

def render(name, dev):
    out_dir = os.path.join(ASSETS, f"{name}.appiconset")
    os.makedirs(out_dir, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        page, shot = os.path.join(tmp, "icon.html"), os.path.join(tmp, "icon.png")
        open(page, "w", encoding="utf-8").write(PAGE.format(svg=svg, dev=DEV if dev else ""))
        subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
                        "--window-size=1024,1024", f"--screenshot={shot}", "file://" + page],
                       check=True, capture_output=True)
        im = Image.open(shot).convert("RGB")  # sin canal alfa: Apple rechaza íconos con transparencia
    assert im.size == (1024, 1024), im.size
    im.save(os.path.join(out_dir, "AppIcon-512@2x.png"))
    open(os.path.join(out_dir, "Contents.json"), "w").write("""{
  "images" : [
    {
      "filename" : "AppIcon-512@2x.png",
      "idiom" : "universal",
      "platform" : "ios",
      "size" : "1024x1024"
    }
  ],
  "info" : {
    "author" : "xcode",
    "version" : 1
  }
}
""")
    print(name, "listo")

render("AppIcon", False)
render("AppIcon-Dev", True)

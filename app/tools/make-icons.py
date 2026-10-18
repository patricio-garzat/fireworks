"""Genera todos los íconos de Fireworks a partir del arte del ícono: ../../brand/source/icon-art.html#willow
(el sauce dorado sobre el lago, dibujado con código a 1024×1024).

- brand/source/icon-1024.png: el original (también lo usa el logo, brand/source/logo.html).
- AppIcon: el original, a sangre y sin transparencia (iOS le pone su propia máscara redondeada).
- AppIcon-Dev: igual, con una franja dorada "DEV" abajo (para "Fireworks Dev", la de dev-install.sh).
- brand/favicon.png (64 px, esquinas redondeadas) y brand/favicon-32.png: un acercamiento al estallido,
  para que se lea en la pestaña del navegador.
- brand/apple-touch-icon.png (180 px): el ícono completo, para "Agregar a inicio" en Safari.

Se renderiza con Chrome sin ventana, como las imágenes del estudio. Uso: python3 tools/make-icons.py
"""
import os
import subprocess
import tempfile

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(HERE, "..")
BRAND = os.path.abspath(os.path.join(APP, "..", "brand"))
ART = os.path.join(BRAND, "source", "icon-art.html")
MASTER = os.path.join(BRAND, "source", "icon-1024.png")
ASSETS = os.path.join(APP, "ios", "App", "App", "Assets.xcassets")
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


def shoot(url, out):
    subprocess.run([CHROME, "--headless=new", "--hide-scrollbars", "--force-device-scale-factor=1",
                    "--window-size=1024,1024", "--virtual-time-budget=4000", f"--screenshot={out}", url],
                   check=True, capture_output=True)
    im = Image.open(out).convert("RGB")  # sin canal alfa: Apple rechaza íconos con transparencia
    assert im.size == (1024, 1024), im.size
    return im


DEV_PAGE = """<!doctype html><meta charset="utf-8"><style>
html, body {{ margin: 0; width: 1024px; height: 1024px; overflow: hidden; background: #04060F; }}
img {{ display: block; width: 1024px; height: 1024px; }}
.dev {{ position: absolute; left: 0; right: 0; bottom: 0; height: 205px; background: #F1C27A; color: #04060F;
  font: 700 128px/205px -apple-system, "SF Pro Display", "Helvetica Neue", sans-serif; letter-spacing: 6px; text-align: center; }}
</style><img src="file://{master}"><div class="dev">DEV</div>"""

CONTENTS = """{
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
"""


def save_set(name, im):
    out_dir = os.path.join(ASSETS, f"{name}.appiconset")
    os.makedirs(out_dir, exist_ok=True)
    im.save(os.path.join(out_dir, "AppIcon-512@2x.png"))
    open(os.path.join(out_dir, "Contents.json"), "w").write(CONTENTS)
    print(name, "listo")


def rounded(im, size, radius=0.2237):
    im = im.resize((size * 4, size * 4), Image.LANCZOS)
    mask = Image.new("L", im.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, im.size[0] - 1, im.size[1] - 1), radius=int(im.size[0] * radius), fill=255)
    out = im.convert("RGBA")
    out.putalpha(mask)
    return out.resize((size, size), Image.LANCZOS)


with tempfile.TemporaryDirectory() as tmp:
    master = shoot("file://" + ART + "#willow", os.path.join(tmp, "master.png"))
    master.save(MASTER)
    save_set("AppIcon", master)
    page = os.path.join(tmp, "dev.html")
    open(page, "w", encoding="utf-8").write(DEV_PAGE.format(master=MASTER))
    save_set("AppIcon-Dev", shoot("file://" + page, os.path.join(tmp, "dev.png")))

# Favicon: acercamiento al estallido (en 32 px el lago no se alcanza a ver)
burst = master.crop((112, 40, 912, 840))
rounded(burst, 64).save(os.path.join(BRAND, "favicon.png"))
rounded(burst, 32, 0.18).save(os.path.join(BRAND, "favicon-32.png"))
master.resize((180, 180), Image.LANCZOS).save(os.path.join(BRAND, "apple-touch-icon.png"))
print("favicon.png, favicon-32.png y apple-touch-icon.png listos")

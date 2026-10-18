"""Exporta el logo de Fireworks (brand/source/logo.html) a brand/logo/, nítido (×2), con Chrome sin ventana.

- fireworks-logo-vertical.png      2400×2400  ícono arriba, nombre, línea dorada y "by BluBer Games" (fondo de noche)
- fireworks-logo-horizontal.png    3600×1200  ícono a la izquierda y el nombre a la derecha (fondo de noche)
- *-clear.png                      lo mismo con fondo transparente (el texto es claro: solo para fondos oscuros)
- fireworks-wordmark-clear.png     3000×600   solo el nombre, transparente

Uso: python3 brand/source/make-logo.py   (antes: python3 app/tools/make-icons.py, que deja icon-1024.png)
"""
import os
import subprocess
import tempfile

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "logo")
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
SIZES = {"vertical": (1200, 1200), "horizontal": (1800, 600), "wordmark": (1500, 300)}
os.makedirs(OUT, exist_ok=True)

for kind, (w, h) in SIZES.items():
    for clear in (False, True):
        if kind == "wordmark" and not clear:
            continue
        name = f"fireworks-{'wordmark' if kind == 'wordmark' else 'logo-' + kind}{'-clear' if clear else ''}.png"
        with tempfile.TemporaryDirectory() as tmp:
            shot = os.path.join(tmp, "s.png")
            args = [CHROME, "--headless=new", "--hide-scrollbars", "--force-device-scale-factor=2", f"--window-size={w},{h}",
                    "--virtual-time-budget=3000", f"--screenshot={shot}"]
            if clear:
                args.append("--default-background-color=00000000")
            subprocess.run(args + ["file://" + os.path.join(HERE, "logo.html") + f"#{kind}{'-clear' if clear else ''}"], check=True, capture_output=True)
            im = Image.open(shot)
            im = im.convert("RGBA") if clear else im.convert("RGB")
            assert im.size == (w * 2, h * 2), im.size
            im.save(os.path.join(OUT, name))
        print(name, im.size)

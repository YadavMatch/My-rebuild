"""
Generates NearMatch's app icon and the heart mark used in the app.

The source concept is two overlapping hearts on a warm orange ground. The
wordmark and tagline from the original artwork are deliberately left out:
at 60pt on a home screen that text is illegible, and Apple's Human Interface
Guidelines advise against text in an app icon.

Run:  python3 scripts/generate-icon.py
"""

import math
from PIL import Image, ImageDraw

# Supersample, then downscale — PIL's polygon fill has no anti-aliasing.
SS = 4
SIZE = 1024

ORANGE = (229, 123, 51, 255)
ORANGE_DEEP = (198, 74, 42, 255)
WHITE = (255, 255, 255, 255)


def heart_points(cx, cy, scale, rotation_deg=0.0, steps=720):
    """Classic parametric heart, centred on (cx, cy)."""
    pts = []
    rot = math.radians(rotation_deg)
    for i in range(steps):
        t = (i / steps) * 2 * math.pi
        x = 16 * math.sin(t) ** 3
        y = -(13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t))
        xr = x * math.cos(rot) - y * math.sin(rot)
        yr = x * math.sin(rot) + y * math.cos(rot)
        pts.append((cx + xr * scale, cy + yr * scale))
    return pts


def draw_hearts(draw, size):
    """
    The two-heart mark, sized relative to the canvas.

    The white rim on the front heart is drawn as a slightly larger heart
    behind it rather than with `outline=`, which spikes at every vertex of a
    720-point polygon.
    """
    c = size / 2
    # Leaves roughly a sixth of the canvas as margin on each side, so the
    # mark survives iOS's corner mask and Android's circular one.
    scale = size / 62
    offset = size * 0.10
    cy = c + size * 0.015

    # Back heart: white, tilted away.
    draw.polygon(heart_points(c - offset, cy, scale, -10), fill=WHITE)

    # Front heart: white rim, then the deeper orange on top of it.
    draw.polygon(heart_points(c + offset, cy, scale * 1.07, 10), fill=WHITE)
    draw.polygon(heart_points(c + offset, cy, scale, 10), fill=ORANGE_DEEP)


def build_icon(path):
    """Full-bleed app icon. No rounded corners: iOS applies its own mask."""
    big = SIZE * SS
    img = Image.new("RGBA", (big, big), ORANGE)
    draw = ImageDraw.Draw(img)
    draw_hearts(draw, big)
    img.resize((SIZE, SIZE), Image.LANCZOS).save(path)
    print("wrote", path)


def build_mark(path, size=512):
    """Transparent hearts only, for use inside the app."""
    big = size * SS
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw_hearts(draw, big)
    img.resize((size, size), Image.LANCZOS).save(path)
    print("wrote", path)


def build_android_foreground(path):
    """
    Android masks adaptive icons aggressively, so the mark sits in the safe
    centre two-thirds rather than filling the canvas.
    """
    big = SIZE * SS
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    inner = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(inner)
    draw_hearts(draw, big)
    inner = inner.resize((int(big * 0.62), int(big * 0.62)), Image.LANCZOS)
    img.paste(inner, (int((big - inner.width) / 2), int((big - inner.height) / 2)), inner)
    img.resize((SIZE, SIZE), Image.LANCZOS).save(path)
    print("wrote", path)


def build_favicon(path, size=96):
    big = size * SS
    img = Image.new("RGBA", (big, big), ORANGE)
    draw = ImageDraw.Draw(img)
    draw_hearts(draw, big)
    img.resize((size, size), Image.LANCZOS).save(path)
    print("wrote", path)


if __name__ == "__main__":
    build_icon("assets/images/icon.png")
    build_mark("assets/images/heart-mark.png")
    build_android_foreground("assets/images/android-icon-foreground.png")
    build_favicon("assets/images/favicon.png")

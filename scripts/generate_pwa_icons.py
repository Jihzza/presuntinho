"""Generate placeholder PWA icons (192x192 and 512x512) for Presuntinho.

Draws a stylised pig face: pink circle background, two triangular ears,
two black eyes, two pink nostrils, and a small smile. No external assets.

Run from repo root: python scripts/generate_pwa_icons.py
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

PINK = (249, 168, 200, 255)        # #f9a8c8 — main pink
PINK_DARK = (232, 122, 168, 255)   # darker pink for ears/snout
BLACK = (24, 24, 32, 255)
WHITE = (255, 255, 255, 255)
BG_FALLBACK = (249, 168, 200, 255)


def draw_pig(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # Full-square pink background (safe zone for maskable icons)
    d.rectangle([0, 0, size, size], fill=BG_FALLBACK)

    # Padding for pig face — outer circle sits inside the safe area.
    pad = size // 8
    # Pig face (lighter pink circle)
    face_box = [pad, pad, size - pad, size - pad]
    d.ellipse(face_box, fill=PINK)

    # Ears (two triangles top-left and top-right)
    ear_w = size // 4
    ear_h = size // 4
    cx = size // 2
    cy = size // 2
    face_r = (size - 2 * pad) // 2

    # Left ear
    left_ear = [
        (cx - face_r * 0.85, cy - face_r * 0.6),
        (cx - face_r * 0.85 + ear_w, cy - face_r * 0.6),
        (cx - face_r * 0.85 + ear_w * 0.4, cy - face_r * 0.95),
    ]
    d.polygon(left_ear, fill=PINK_DARK)
    # Right ear
    right_ear = [
        (cx + face_r * 0.85 - ear_w, cy - face_r * 0.6),
        (cx + face_r * 0.85, cy - face_r * 0.6),
        (cx + face_r * 0.85 - ear_w * 0.4, cy - face_r * 0.95),
    ]
    d.polygon(right_ear, fill=PINK_DARK)

    # Snout (slightly darker pink oval, lower-centre)
    snout_w = face_r * 1.1
    snout_h = face_r * 0.7
    snout_box = [
        cx - snout_w / 2,
        cy + face_r * 0.15,
        cx + snout_w / 2,
        cy + face_r * 0.15 + snout_h,
    ]
    d.ellipse(snout_box, fill=PINK_DARK)
    # Nostrils
    nostril_r = max(2, size // 64)
    d.ellipse(
        [cx - snout_w * 0.22 - nostril_r, cy + face_r * 0.45 - nostril_r,
         cx - snout_w * 0.22 + nostril_r, cy + face_r * 0.45 + nostril_r],
        fill=BLACK,
    )
    d.ellipse(
        [cx + snout_w * 0.22 - nostril_r, cy + face_r * 0.45 - nostril_r,
         cx + snout_w * 0.22 + nostril_r, cy + face_r * 0.45 + nostril_r],
        fill=BLACK,
    )

    # Eyes — two black ovals above the snout
    eye_w = face_r * 0.18
    eye_h = face_r * 0.26
    eye_y = cy - face_r * 0.15
    d.ellipse(
        [cx - face_r * 0.45 - eye_w, eye_y - eye_h,
         cx - face_r * 0.45 + eye_w, eye_y + eye_h],
        fill=BLACK,
    )
    d.ellipse(
        [cx + face_r * 0.45 - eye_w, eye_y - eye_h,
         cx + face_r * 0.45 + eye_w, eye_y + eye_h],
        fill=BLACK,
    )
    # Eye highlights
    hl_r = max(1, size // 96)
    hl_off = eye_w * 0.3
    d.ellipse(
        [cx - face_r * 0.45 - hl_r - hl_off, eye_y - eye_h * 0.4,
         cx - face_r * 0.45 + hl_r - hl_off, eye_y - eye_h * 0.4 + hl_r * 2],
        fill=WHITE,
    )
    d.ellipse(
        [cx + face_r * 0.45 - hl_r - hl_off, eye_y - eye_h * 0.4,
         cx + face_r * 0.45 + hl_r - hl_off, eye_y - eye_h * 0.4 + hl_r * 2],
        fill=WHITE,
    )

    return img


def main() -> None:
    out_dir = Path("static/icons")
    out_dir.mkdir(parents=True, exist_ok=True)
    for size in (192, 512):
        img = draw_pig(size)
        out = out_dir / f"icon-{size}.png"
        img.save(out, format="PNG", optimize=True)
        print(f"wrote {out} ({size}x{size})")


if __name__ == "__main__":
    main()
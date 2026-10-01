#!/usr/bin/env python3
"""Generate the hand-built SVG theme backgrounds in public/images/themes/.

Each background is portrait (1080x1920) like the other theme art: the
busiest detail sits at the top (behind the header) and bottom (behind the
keyboard), with calmer space in the middle where the board goes. Random
placement is seeded, so re-running produces identical files.

Usage:  python3 tools/make_theme_art.py
"""

import math
import os
import random

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "images", "themes")
W, H = 1080, 1920


def svg(body, defs=""):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMin slice">\n'
        f"<defs>{defs}</defs>\n{body}\n</svg>\n"
    )


def f(n):
    return f"{n:.1f}".rstrip("0").rstrip(".")


# -------------------------------------------------------------- terminal

BOOT_LOG = [
    "WORDLY BIOS v2.84  (C) 1984 LEXICON SYSTEMS",
    "MEMORY TEST ........ 640K OK",
    "DETECTING DRIVES ... A: B: C:",
    "LOADING DICTIONARY.DAT",
    "  172823 ENTRIES INDEXED",
    "MOUNTING /GAMES ....... OK",
    "  WORDLY.EXE   BEE.EXE   BOXED.EXE",
    "",
    "C:\\> RUN WORDLY",
    "READY.",
]


def terminal():
    defs = """
<radialGradient id="screen" cx="0.5" cy="0.45" r="0.75">
  <stop offset="0" stop-color="#062a0a"/><stop offset="0.55" stop-color="#021405"/>
  <stop offset="1" stop-color="#000000"/>
</radialGradient>
<radialGradient id="vignette" cx="0.5" cy="0.5" r="0.72">
  <stop offset="0.6" stop-color="#000" stop-opacity="0"/>
  <stop offset="1" stop-color="#000" stop-opacity="0.85"/>
</radialGradient>
<pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
  <path d="M60,0 H0 V60" fill="none" stroke="#33ff33" stroke-width="1" opacity="0.07"/>
</pattern>
"""
    b = [f'<rect width="{W}" height="{H}" fill="url(#screen)"/>', f'<rect width="{W}" height="{H}" fill="url(#grid)"/>']
    b.append('<g font-family="Courier New, Consolas, monospace" font-size="30" fill="#33ff33" opacity="0.32">')
    for i, line in enumerate(BOOT_LOG):
        esc = line.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        b.append(f'<text x="60" y="{210 + i * 44}" xml:space="preserve">{esc}</text>')
    b.append('<rect x="60" y="{}" width="18" height="30" opacity="1"/>'.format(210 + len(BOOT_LOG) * 44 - 24))
    b.append("</g>")
    # memory-dump style hex rows along the bottom
    rnd = random.Random(3)
    b.append('<g font-family="Courier New, Consolas, monospace" font-size="24" fill="#33ff33" opacity="0.16">')
    for i in range(12):
        addr = f"{0x7C00 + i * 16:04X}"
        row = " ".join(f"{rnd.randrange(256):02X}" for _ in range(12))
        b.append(f'<text x="60" y="{1400 + i * 36}">{addr}: {row}</text>')
    b.append("</g>")
    b.append(f'<rect width="{W}" height="{H}" fill="url(#vignette)"/>')
    b.append(f'<rect x="14" y="14" width="{W - 28}" height="{H - 28}" rx="60" fill="none" stroke="#33ff33" stroke-width="3" opacity="0.18"/>')
    return svg("\n".join(b), defs)


# -------------------------------------------------------------- bubblegum

def bubblegum():
    rnd = random.Random(11)
    ink = "#5a2a52"
    palette = ["#ff8fc7", "#8fd9a8", "#ffd479", "#c7a8ff", "#8fd3ff", "#ffb38a"]
    defs = """
<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#ffd6ea"/><stop offset="0.5" stop-color="#fff0f6"/>
  <stop offset="1" stop-color="#eadcff"/>
</linearGradient>
<pattern id="dots" width="44" height="44" patternUnits="userSpaceOnUse">
  <circle cx="22" cy="22" r="3" fill="#ff8fc7" opacity="0.22"/>
</pattern>
"""
    b = [f'<rect width="{W}" height="{H}" fill="url(#bg)"/>', f'<rect width="{W}" height="{H}" fill="url(#dots)"/>']

    # scalloped cloud band across the top
    top = [f'<path fill="#ffffff" stroke="{ink}" stroke-width="6" d="M-20,0 L-20,150']
    x = -20
    while x < W + 20:
        r = rnd.uniform(55, 85)
        top.append(f" a{f(r)},{f(r * 0.8)} 0 0 0 {f(r * 2)},0")
        x += r * 2
    top.append(f' L{f(x)},0 Z"/>')
    b.append("".join(top))

    def bubble(cx, cy, r, color):
        return (
            f'<circle cx="{f(cx + r * 0.08)}" cy="{f(cy + r * 0.1)}" r="{f(r)}" fill="{ink}" opacity="0.9"/>'
            f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" fill="{color}" stroke="{ink}" stroke-width="6"/>'
            f'<path d="M{f(cx - r * 0.62)},{f(cy - r * 0.05)} A{f(r * 0.62)},{f(r * 0.62)} 0 0 1 {f(cx - r * 0.05)},{f(cy - r * 0.62)}" '
            f'fill="none" stroke="#ffffff" stroke-width="{f(max(6, r * 0.12))}" stroke-linecap="round"/>'
            f'<circle cx="{f(cx + r * 0.1)}" cy="{f(cy - r * 0.68)}" r="{f(max(4, r * 0.07))}" fill="#ffffff"/>'
        )

    bubbles = [
        (130, 330, 120, palette[0]), (930, 300, 95, palette[4]), (720, 420, 50, palette[2]),
        (330, 470, 38, palette[3]), (1010, 640, 60, palette[1]), (60, 720, 45, palette[2]),
        (150, 1530, 110, palette[1]), (960, 1480, 130, palette[3]), (560, 1640, 70, palette[5]),
        (780, 1720, 40, palette[0]), (330, 1320, 34, palette[4]),
    ]
    # sprinkles everywhere except the board's middle band
    for _ in range(140):
        sx, sy = rnd.uniform(0, W), rnd.uniform(160, H)
        if 820 < sy < 1260 and 120 < sx < 960:
            continue
        ang = rnd.uniform(0, 180)
        c = rnd.choice(palette)
        b.append(f'<rect x="{f(sx - 16)}" y="{f(sy - 5)}" width="32" height="10" rx="5" fill="{c}" stroke="{ink}" stroke-width="2.5" transform="rotate({f(ang)} {f(sx)} {f(sy)})"/>')
    for cx, cy, r, c in bubbles:
        b.append(bubble(cx, cy, r, c))

    # candy-stripe wave at the bottom
    stripe_defs = (
        '<pattern id="stripes" width="80" height="80" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">'
        '<rect width="80" height="80" fill="#ffffff"/><rect width="40" height="80" fill="#ff8fc7"/></pattern>'
    )
    wave = f'<path fill="url(#stripes)" stroke="{ink}" stroke-width="6" d="M-20,1800'
    x = -20
    up = True
    while x < W + 20:
        wave += f" q70,{-50 if up else 50} 140,0"
        x += 140
        up = not up
    wave += f' L{x},{H + 20} L-20,{H + 20} Z"/>'
    b.append(wave)
    return svg("\n".join(b), defs + stripe_defs)


# --------------------------------------------------------------- art deco

def art_deco():
    gold, champagne, emerald = "#d4af37", "#e8d5a3", "#1f6f63"
    defs = f"""
<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#07090d"/><stop offset="0.5" stop-color="#0d141b"/>
  <stop offset="1" stop-color="#07090d"/>
</linearGradient>
<linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#f3dc8a"/><stop offset="0.5" stop-color="{gold}"/>
  <stop offset="1" stop-color="#9c7a22"/>
</linearGradient>
<radialGradient id="halo" cx="0.5" cy="0.12" r="0.5">
  <stop offset="0" stop-color="{gold}" stop-opacity="0.22"/>
  <stop offset="1" stop-color="{gold}" stop-opacity="0"/>
</radialGradient>
"""
    b = [f'<rect width="{W}" height="{H}" fill="url(#bg)"/>', f'<rect width="{W}" height="{H}" fill="url(#halo)"/>']

    # sunburst fan hanging from the top center
    cx, cy = 540, 60
    for i in range(37):
        a = math.radians(180 - i * 5)
        x2, y2 = cx + math.cos(a) * 620, cy + math.sin(a) * -620
        if y2 < cy:
            y2 = cy + (cy - y2)
        w = 2.5 if i % 2 else 1.2
        b.append(f'<line x1="{cx}" y1="{cy}" x2="{f(x2)}" y2="{f(abs(y2))}" stroke="{gold}" stroke-width="{w}" opacity="{0.55 if i % 2 else 0.3}"/>')
    for r, sw, o in [(140, 3, 0.9), (170, 1.5, 0.7), (330, 3, 0.6), (360, 1.5, 0.45), (560, 2, 0.35)]:
        b.append(f'<path d="M{cx - r},{cy} A{r},{r} 0 0 0 {cx + r},{cy}" fill="none" stroke="{gold}" stroke-width="{sw}" opacity="{o}"/>')
    b.append(f'<path d="M{cx - 110},{cy} A110,110 0 0 0 {cx + 110},{cy} Z" fill="url(#gold)"/>')
    for i in range(9):
        a = math.radians(180 - (i + 0.5) * 20)
        x1, y1 = cx + math.cos(a) * 30, cy - math.sin(a) * -30
        x2, y2 = cx + math.cos(a) * 100, cy - math.sin(a) * -100
        b.append(f'<line x1="{f(x1)}" y1="{f(y1)}" x2="{f(x2)}" y2="{f(y2)}" stroke="#07090d" stroke-width="5"/>')

    # double frame lines down both sides with chevron stacks
    for x in (36, 52, W - 52, W - 36):
        b.append(f'<line x1="{x}" y1="0" x2="{x}" y2="{H}" stroke="{gold}" stroke-width="{2 if x in (36, W - 36) else 1}" opacity="0.6"/>')
    for side in (1, -1):
        x0 = 44 if side == 1 else W - 44
        for i in range(5):
            y = 760 + i * 34
            b.append(f'<path d="M{x0 - 22},{y} L{x0},{y + 18} L{x0 + 22},{y}" fill="none" stroke="{gold}" stroke-width="2" opacity="{0.7 - i * 0.1}"/>')

    # stepped skyline across the bottom
    bldg = []
    rnd = random.Random(5)
    x = 70
    heights = [260, 380, 300, 520, 340, 640, 360, 480, 300, 420, 260]
    widths = [80, 90, 70, 100, 80, 120, 80, 100, 70, 90, 80]
    for h, w in zip(heights, widths):
        top = H - h
        steps = 3
        d = f"M{x},{H} L{x},{top + steps * 30}"
        for s in range(steps):
            inset = (s + 1) * w * 0.12
            d += f" L{f(x + inset - w * 0.12)},{top + (steps - s) * 30} L{f(x + inset)},{top + (steps - s) * 30}"
        d += f" L{f(x + w / 2)},{top - 40}"
        for s in reversed(range(steps)):
            inset = (s + 1) * w * 0.12
            d += f" L{f(x + w - inset)},{top + (steps - s) * 30} L{f(x + w - inset + w * 0.12)},{top + (steps - s) * 30}"
        d += f" L{x + w},{top + steps * 30} L{x + w},{H} Z"
        bldg.append(f'<path d="{d}" fill="#0b1117" stroke="{gold}" stroke-width="2" opacity="0.95"/>')
        # lit window columns
        for wx in (x + w * 0.3, x + w * 0.5, x + w * 0.7):
            for wy in range(int(top + 140), H - 30, 46):
                if rnd.random() < 0.4:
                    bldg.append(f'<rect x="{f(wx - 3)}" y="{wy}" width="6" height="18" fill="{champagne}" opacity="{f(rnd.uniform(0.35, 0.8))}"/>')
        x += w + 8
    b += bldg
    b.append(f'<rect x="0" y="{H - 6}" width="{W}" height="6" fill="{gold}"/>')
    # emerald diamond accents
    for dx, dy in [(540, 880), (190, 1210), (890, 1210)]:
        b.append(f'<path d="M{dx},{dy - 22} L{dx + 14},{dy} L{dx},{dy + 22} L{dx - 14},{dy} Z" fill="{emerald}" stroke="{gold}" stroke-width="2" opacity="0.55"/>')
    return svg("\n".join(b), defs)


def main():
    for name, fn in [
        ("terminal", terminal),
        ("bubblegum", bubblegum),
        ("art-deco", art_deco),
    ]:
        path = os.path.join(OUT, f"{name}.svg")
        with open(path, "w") as fh:
            fh.write(fn())
        print(f"{name}.svg  {os.path.getsize(path) // 1024} KB")


if __name__ == "__main__":
    main()

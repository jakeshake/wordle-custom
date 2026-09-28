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


# ------------------------------------------------------------- halloween

def bat(x, y, s, rot):
    return (
        f'<path transform="translate({f(x)},{f(y)}) rotate({f(rot)}) scale({f(s)})" fill="#0a0406" '
        'd="M0,6 C-6,-4 -14,-8 -26,-6 C-22,-2 -22,2 -24,6 C-18,3 -14,5 -12,9 C-9,5 -5,5 -3,8 '
        'L-2,3 L0,5 L2,3 L3,8 C5,5 9,5 12,9 C14,5 18,3 24,6 C22,2 22,-2 26,-6 C14,-8 6,-4 0,6 Z"/>'
    )


def pumpkin(x, y, s):
    face = (
        f'<path d="M{f(x - 30 * s)},{f(y - 8 * s)} l{f(14 * s)},{f(-16 * s)} l{f(12 * s)},{f(16 * s)} Z" fill="#ffe27a"/>'
        f'<path d="M{f(x + 4 * s)},{f(y - 8 * s)} l{f(14 * s)},{f(-16 * s)} l{f(12 * s)},{f(16 * s)} Z" fill="#ffe27a"/>'
        f'<path d="M{f(x - 34 * s)},{f(y + 10 * s)} q{f(34 * s)},{f(26 * s)} {f(68 * s)},0 l{f(-10 * s)},{f(4 * s)} '
        f'l{f(-6 * s)},{f(-6 * s)} l{f(-8 * s)},{f(8 * s)} l{f(-8 * s)},{f(-8 * s)} l{f(-8 * s)},{f(8 * s)} '
        f'l{f(-8 * s)},{f(-8 * s)} l{f(-6 * s)},{f(6 * s)} Z" fill="#ffd24a"/>'
    )
    return (
        f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(95 * s)}" fill="url(#pglow)"/>'
        f'<rect x="{f(x - 5 * s)}" y="{f(y - 62 * s)}" width="{f(10 * s)}" height="{f(20 * s)}" rx="{f(3 * s)}" fill="#3d5a1e"/>'
        f'<ellipse cx="{f(x - 26 * s)}" cy="{f(y)}" rx="{f(30 * s)}" ry="{f(44 * s)}" fill="#d9560f"/>'
        f'<ellipse cx="{f(x + 26 * s)}" cy="{f(y)}" rx="{f(30 * s)}" ry="{f(44 * s)}" fill="#d9560f"/>'
        f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="{f(34 * s)}" ry="{f(46 * s)}" fill="#f07418"/>'
        + face
    )


def halloween():
    rnd = random.Random(31)
    defs = """
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#07030a"/><stop offset="0.3" stop-color="#1d0b2a"/>
  <stop offset="0.55" stop-color="#3b1440"/><stop offset="0.8" stop-color="#5a1f35"/>
  <stop offset="1" stop-color="#1a0a10"/>
</linearGradient>
<radialGradient id="moonGlow" cx="0.5" cy="0.27" r="0.45">
  <stop offset="0" stop-color="#ffb347" stop-opacity="0.55"/>
  <stop offset="0.4" stop-color="#ff7518" stop-opacity="0.18"/>
  <stop offset="1" stop-color="#ff7518" stop-opacity="0"/>
</radialGradient>
<radialGradient id="moon" cx="0.42" cy="0.38" r="0.7">
  <stop offset="0" stop-color="#ffe6a6"/><stop offset="0.6" stop-color="#ffb347"/>
  <stop offset="1" stop-color="#f07a1c"/>
</radialGradient>
<radialGradient id="pglow">
  <stop offset="0" stop-color="#ffb347" stop-opacity="0.55"/>
  <stop offset="1" stop-color="#ff7518" stop-opacity="0"/>
</radialGradient>
<radialGradient id="win">
  <stop offset="0" stop-color="#ffcf5a"/><stop offset="1" stop-color="#ff8a1a"/>
</radialGradient>
"""
    b = [f'<rect width="{W}" height="{H}" fill="url(#sky)"/>']
    for _ in range(60):
        b.append(f'<circle cx="{f(rnd.uniform(0, W))}" cy="{f(rnd.uniform(0, 900))}" r="{f(rnd.uniform(0.8, 2))}" fill="#ffe6c9" opacity="{f(rnd.uniform(0.2, 0.6))}"/>')
    b.append(f'<rect width="{W}" height="{H}" fill="url(#moonGlow)"/>')
    b.append('<circle cx="540" cy="520" r="250" fill="url(#moon)"/>')
    for cx, cy, r in [(470, 450, 34), (610, 560, 26), (520, 640, 18), (640, 420, 14)]:
        b.append(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="#e08a2a" opacity="0.28"/>')
    # thin clouds drifting across the moon
    for y, x0, w, o in [(470, 180, 520, 0.55), (610, 430, 560, 0.45), (330, 620, 360, 0.35)]:
        b.append(f'<ellipse cx="{x0 + w / 2}" cy="{y}" rx="{w / 2}" ry="16" fill="#1d0b2a" opacity="{o}"/>')
    for x, y, s, r in [(300, 330, 2.4, -12), (760, 300, 2.0, 10), (840, 640, 1.6, 18), (220, 720, 1.5, -20),
                       (650, 200, 1.2, 6), (430, 780, 1.1, -8), (920, 470, 1.3, 14), (130, 470, 1.1, -4)]:
        b.append(bat(x, y, s, r))
    # far hill with the haunted house, lit windows
    b.append('<path d="M0,1390 C200,1330 380,1370 560,1320 C720,1280 900,1300 1080,1260 L1080,1920 L0,1920 Z" fill="#12061a"/>')
    house = [
        '<g fill="#07030a">',
        '<rect x="760" y="1150" width="190" height="160"/>',
        '<path d="M740,1155 L855,1065 L970,1155 Z"/>',
        '<rect x="700" y="1200" width="80" height="110"/><path d="M690,1205 L740,1150 L790,1205 Z"/>',
        '<rect x="890" y="1010" width="22" height="80"/>',
        '<rect x="820" y="1080" width="46" height="90"/><path d="M810,1085 L843,1030 L876,1085 Z"/>',
        '</g>',
    ]
    b += house
    for wx, wy in [(785, 1190), (905, 1190), (835, 1100), (722, 1235), (845, 1245)]:
        b.append(f'<rect x="{wx}" y="{wy}" width="20" height="28" fill="url(#win)"/>')
    # near hill, dead tree, fence
    b.append('<path d="M0,1560 C220,1500 420,1540 620,1500 C820,1460 950,1500 1080,1470 L1080,1920 L0,1920 Z" fill="#0a0406"/>')
    tree = (
        '<g fill="none" stroke="#0a0406" stroke-linecap="round">'
        '<path d="M170,1560 C160,1440 190,1330 150,1220" stroke-width="34"/>'
        '<path d="M155,1250 C110,1190 70,1170 20,1160" stroke-width="16"/>'
        '<path d="M160,1300 C230,1250 280,1180 330,1160" stroke-width="16"/>'
        '<path d="M300,1170 C320,1130 350,1110 390,1100" stroke-width="8"/>'
        '<path d="M150,1220 C160,1150 130,1100 150,1040" stroke-width="12"/>'
        '<path d="M60,1165 C40,1130 50,1100 30,1080" stroke-width="7"/>'
        '<path d="M150,1080 C190,1060 210,1030 240,1020" stroke-width="6"/>'
        '</g>'
    )
    b.append(tree)
    fence = ['<g fill="#0a0406">']
    for i in range(12):
        x = 470 + i * 50
        y = 1520 - i * 3
        fence.append(f'<path d="M{x},{y} l8,-16 l8,16 v70 h-16 Z"/>')
    fence.append('<rect x="460" y="1530" width="620" height="8"/><rect x="460" y="1565" width="620" height="8"/></g>')
    b += fence
    b.append(pumpkin(160, 1720, 1.35))
    b.append(pumpkin(930, 1700, 1.1))
    b.append(pumpkin(560, 1800, 0.8))
    return svg("\n".join(b), defs)


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
        ("halloween", halloween),
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

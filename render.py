#!/usr/bin/env python3
"""Render THE WORLD TODAY front page for Saturday 21 November 2026.

Build-time only: draws entry.png (1024x1024) with PIL. Nothing here runs
at grade time; main.ts just copies the finished image.
"""
import math
from PIL import Image, ImageDraw, ImageFont

W, H = 1024, 1024
M = 28                      # side margin
CW = W - 2 * M              # content width
CREAM = (247, 243, 234)
INK = (26, 26, 26)
NAVY = (31, 58, 95)
RED = (158, 32, 32)
TEAL = (14, 94, 94)
GREY = (96, 92, 84)
TAN = (238, 231, 214)
HAIR = (180, 175, 160)

SERIF = "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf"
SANS = "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"
SANS_B = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"

img = Image.new("RGB", (W, H), CREAM)
d = ImageDraw.Draw(img)


def font(path, size):
    return ImageFont.truetype(path, size)


def tw(text, f):
    return d.textlength(text, font=f)


def wrap(text, f, width):
    lines, cur = [], ""
    for word in text.split():
        trial = f"{cur} {word}".strip()
        if tw(trial, f) <= width:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = word
    if cur:
        lines.append(cur)
    return lines


def para(text, f, x, y, width, leading, color=INK):
    for line in wrap(text, f, width):
        d.text((x, y), line, font=f, fill=color)
        y += leading
    return y


def rule(x0, x1, y, wdt=2, color=INK):
    d.line([(x0, y), (x1, y)], fill=color, width=wdt)


def kicker(text, x, y, color=RED, size=14):
    f = font(SANS_B, size)
    d.text((x, y), text, font=f, fill=color)
    return y + size + 6


def headline(text, f, x, y, width, leading):
    for line in wrap(text, f, width):
        d.text((x, y), line, font=f, fill=INK)
        y += leading
    return y


# ---------- masthead ----------
rule(M, W - M, 14, 3)
f_mast = font(SERIF, 66)
mast = "THE WORLD TODAY"
d.text(((W - tw(mast, f_mast)) / 2, 22), mast, font=f_mast, fill=INK)
rule(M, W - M, 96, 3)
rule(M, W - M, 101, 1)

# ---------- date bar ----------
d.rectangle([M, 110, W - M, 150], fill=NAVY)
f_date = font(SERIF, 30)
dtxt = "SATURDAY, 21 NOVEMBER 2026"
d.text(((W - tw(dtxt, f_date)) / 2, 116), dtxt, font=f_date, fill=(255, 255, 255))
f_sub = font(SANS_B, 14)
sub = "THE WORLD'S NEWS IN ONE PAGE  \u2022  EVERY STORY FROM SATURDAY 21 NOVEMBER 2026"
d.text(((W - tw(sub, f_sub)) / 2, 158), sub, font=f_sub, fill=GREY)

# ---------- lead story + side panel ----------
ly = 184
LX, LW = M, 592
RX, RW = 640, W - M - 640
y = kicker("NATO  \u2022  POLAND", LX, ly, RED)
y = headline("NATO chief flies to Warsaw after Russian missiles land in Poland",
             font(SERIF, 38), LX, y, LW, 43)
y += 4
y = para("Mark Rutte heads to Warsaw today, a day after two Russian missiles and "
         "a drone came down in south-east Poland. Warsaw calls it a deliberate "
         "provocation.",
         font(SANS, 15), LX, y, LW, 20)
y += 8
chips = ["2 MISSILES DOWN IN POLAND", "3 OBJECTS CROSSED THE BORDER", "NO ONE HURT"]
cx = LX
f_chip = font(SANS_B, 12)
for c in chips:
    cw = tw(c, f_chip) + 16
    d.rectangle([cx, y, cx + cw, y + 26], outline=RED, width=2)
    d.text((cx + 8, y + 6), c, font=f_chip, fill=RED)
    cx += cw + 8
lead_bottom = y + 26

# right panel: navy box with a drawn compass star
d.rectangle([RX, ly, RX + RW, lead_bottom], fill=NAVY)
px = RX + 18
d.text((px, ly + 14), "WARSAW", font=font(SANS_B, 22), fill=(255, 255, 255))
d.text((px, ly + 42), "NATO'S EASTERN FLANK", font=font(SANS_B, 12), fill=(170, 195, 225))
cx0, cy0 = RX + RW - 74, ly + 96
star = []
for dx, dy in [(0, -52), (10, -10), (52, 0), (10, 10),
               (0, 52), (-10, 10), (-52, 0), (-10, -10)]:
    star.append((cx0 + dx, cy0 + dy))
d.polygon(star, outline=(150, 185, 220), width=2)
d.ellipse([cx0 - 7, cy0 - 7, cx0 + 7, cy0 + 7], fill=(255, 255, 255))
d.text((px, lead_bottom - 62), "RUTTE DUE TODAY", font=font(SANS_B, 15), fill=(255, 255, 255))
d.text((px, lead_bottom - 40), "Poland seeks more Eastern Sentry forces",
       font=font(SANS, 13), fill=(200, 215, 235))
d.text((px, lead_bottom - 22), "after Friday's incursion near the drills.",
       font=font(SANS, 13), fill=(200, 215, 235))

rule(M, W - M, lead_bottom + 12, 2)


def card(x, y, w, kick, kick_color, head, deck, hsize=23, dsize=15):
    """One story card with a coloured top rule. Returns bottom y."""
    d.line([(x, y), (x + w, y)], fill=kick_color, width=4)
    yy = y + 10
    yy = kicker(kick, x, yy, kick_color, 13)
    yy = headline(head, font(SERIF, hsize), x, yy, w, hsize + 5)
    yy = para(deck, font(SANS, dsize), x, yy + 2, w, dsize + 5)
    return yy


# ---------- row 2: two stories ----------
ry = lead_bottom + 22
half = (CW - 24) // 2
b1 = card(M, ry, half, "EUROPE  \u2022  FRANCE", RED,
          "France marches again as living costs bite",
          "A fourth weekend of cost-of-living protests fills French cities, "
          "with 70,000 police deployed and a march through Paris from the "
          "Place de la R\u00e9publique to the Nation.", hsize=24, dsize=14)
b2 = card(M + half + 24, ry, half, "ASIA  \u2022  ENVIRONMENT", TEAL,
          "Indonesia fires may cost $30bn",
          "Economic losses from this year's fires could reach $30 billion, and "
          "the EU's Copernicus service puts fire emissions at the third-highest "
          "on record.", hsize=24, dsize=14)
row2_bottom = max(b1, b2)
rule(M, W - M, row2_bottom + 10, 1, HAIR)

# ---------- row 3: three stories ----------
ry = row2_bottom + 20
third = (CW - 48) // 3
c1 = card(M, ry, third, "ASIA  \u2022  MYANMAR", RED,
          "Malaysia plans to resettle 10,000 Rohingya in Turkiye",
          "Kuala Lumpur offers refugees a new home after the genocide ruling.",
          hsize=19, dsize=13)
c2 = card(M + third + 24, ry, third, "ASIA  \u2022  NEPAL", NAVY,
          "Nepal's PM to visit India on Sunday",
          "Balendra Shah heads to New Delhi for a two-day visit, his first in office.",
          hsize=19, dsize=13)
c3 = card(M + 2 * (third + 24), ry, third, "ASIA  \u2022  DIPLOMACY", TEAL,
          "Pakistan climate minister arrives in Delhi",
          "Islamabad's climate chief joins the SCO dialogue forum in New Delhi.",
          hsize=19, dsize=13)
row3_bottom = max(c1, c2, c3)
rule(M, W - M, row3_bottom + 10, 1, HAIR)

# ---------- row 4: three stories ----------
ry = row3_bottom + 20
d1 = card(M, ry, third, "SPORT  \u2022  FOOTBALL", TEAL,
          "UEFA backs Diallo to take on Infantino for FIFA top job",
          "Europe's governing body backs France's Diallo against the incumbent.",
          hsize=19, dsize=13)
d2 = card(M + third + 24, ry, third, "INDIA  \u2022  WILDLIFE", RED,
          "Cheetah gives birth to four cubs at Kuno",
          "A cheetah from Botswana delivers a litter of four at the park.",
          hsize=19, dsize=13)
d3 = card(M + 2 * (third + 24), ry, third, "SPORT  \u2022  CRICKET", NAVY,
          "India resume on 159-1 on day three in Wellington",
          "Jaiswal's 85 and Rahul's 52 not out leave India 209 behind.",
          hsize=19, dsize=13)
row4_bottom = max(d1, d2, d3)

# ---------- the day in numbers ----------
ny = row4_bottom + 12
rule(M, W - M, ny, 2)
d.text((M, ny + 8), "THE DAY IN NUMBERS", font=font(SANS_B, 14), fill=RED)
stats = [
    ("70,000", "police on duty in France"),
    ("10,000", "Rohingya to be resettled"),
    ("$30bn", "fire losses, estimated"),
    ("4", "cheetah cubs at Kuno"),
    ("159\u20131", "India's score, day three"),
]
sy = ny + 30
f_num = font(SERIF, 28)
f_cap = font(SANS, 12)
col_w = CW // 5
for i, (num, cap) in enumerate(stats):
    x = M + i * col_w
    d.text((x, sy), num, font=f_num, fill=NAVY)
    d.text((x, sy + 34), cap, font=f_cap, fill=INK)
num_bottom = sy + 34 + 14

# ---------- the day after ----------
ay = num_bottom + 8
d.rectangle([M, ay, W - M, ay + 54], fill=TAN)
d.text((M + 12, ay + 6), "THE DAY AFTER  \u2014  FRIDAY 20 NOVEMBER",
       font=font(SANS_B, 13), fill=RED)
para("A day after the first Trump\u2013Xi\u2013Putin summit in Shenzhen ended with no deal "
     "on Ukraine or Iran, Russian missiles landed in Poland, Kyiv's bridges were hit, "
     "the world court ruled Myanmar committed genocide, Cyclone Akvan struck India's "
     "east coast and US stocks slid into correction.",
     font(SANS, 13), M + 12, ay + 24, CW - 24, 15)

# ---------- also today ----------
ty = ay + 54 + 8
d.text((M, ty), "ALSO TODAY", font=font(SANS_B, 13), fill=INK)
rule(M, W - M, ty + 18, 2)
para("Youth cost-of-living actions spread across Europe this weekend  \u2022  "
     "Thailand and China deepen ties on Mekong water and trade  \u2022  "
     "Japan's forces to train live-fire in India, a first  \u2022  "
     "IFFI adds an animation section  \u2022  "
     "Storm Xavier brings gale warnings",
     font(SANS, 13), M, ty + 26, CW, 17, color=(60, 58, 52))

# ---------- footer ----------
rule(M, W - M, H - 26, 2)
f_foot = font(SANS_B, 12)
foot = "THE WORLD TODAY  \u2014  SATURDAY 21 NOVEMBER 2026  \u2014  ONE DAY, ONE PAGE"
d.text(((W - tw(foot, f_foot)) / 2, H - 20), foot, font=f_foot, fill=GREY)

img.save("entry.png", optimize=True)
print("saved entry.png", img.size, "last content y:", ty + 26 + 34)

"""Fleet decals: one ship-decal atlas per operating company (same layout as decals.png)
and one container-sticker atlas per shipper brand (1024 px, same layout for all brands).
Also writes fleet_companies.json (colours + atlas rects) used by Blender and by the game."""
import json, math, os
from PIL import Image, ImageDraw, ImageFont

OUT = os.environ.get("STT_TEXTURES_OUT", "textures")
FONT_DIR = os.environ.get("STT_FONT_DIR", "fonts")
DARK, LIGHT = (32, 34, 38, 255), (236, 236, 232, 255)
YEL, BLK, RED = (222, 160, 10, 255), (18, 18, 18, 255), (190, 30, 24, 255)

COMPANIES = {
    "STT": dict(name="Space Travel & Transport", mark="STT", tagline="SPACE TRAVEL & TRANSPORT", emblem="chevrons",
                accent=(14, 70, 150), accent_light=(90, 150, 230), registry="STT-0107",
                livery=(0.025, 0.13, 0.42), livery_dark=(0.012, 0.05, 0.16)),
    "HLN": dict(name="Helion Lines", mark="HELION", tagline="LINES  -  PASSENGER SERVICES", emblem="sun",
                accent=(205, 135, 10), accent_light=(250, 190, 60), registry="HLN-2201",
                livery=(0.62, 0.36, 0.04), livery_dark=(0.24, 0.12, 0.01)),
    "KVF": dict(name="Kessler & Vance Freight", mark="K&V", tagline="KESSLER & VANCE FREIGHT", emblem="bars",
                accent=(170, 22, 16), accent_light=(240, 80, 60), registry="KVF-0318",
                livery=(0.42, 0.03, 0.02), livery_dark=(0.15, 0.012, 0.01)),
    "SHL": dict(name="Starhaul Logistics", mark="STARHAUL", tagline="LOGISTICS  -  DRONE HANDLING", emblem="star",
                accent=(20, 120, 60), accent_light=(80, 200, 120), registry="SHL-0042",
                livery=(0.03, 0.28, 0.10), livery_dark=(0.01, 0.10, 0.035)),
    "AQB": dict(name="Aquila Bulk", mark="AQUILA", tagline="BULK  -  REFUELLING", emblem="wing",
                accent=(220, 90, 10), accent_light=(255, 150, 70), registry="AQB-0775",
                livery=(0.72, 0.20, 0.02), livery_dark=(0.28, 0.07, 0.008)),
}

BRANDS = {
    "VESTA": dict(name="VESTA AGRO", emblem="leaf", material="Container_Green", ink=LIGHT, code="VSTU 120455 2"),
    "GANY": dict(name="GANYMEDE MINERAL CO.", emblem="crystal", material="Container_Grey", ink=LIGHT, code="GMCU 778301 6"),
    "NOVA": dict(name="NOVAMED PHARMA", emblem="cross", material="Container_White", ink=DARK, code="NMPU 300219 1"),
    "ORION": dict(name="ORION ELECTRONICS", emblem="belt", material="Container_Blue", ink=LIGHT, code="ORNU 551870 3"),
    "LUNA": dict(name="LUNA HYDROPONICS", emblem="crescent", material="Container_Teal", ink=LIGHT, code="LNHU 264011 8"),
    "POLARIS": dict(name="POLARIS TEXTILES", emblem="star4", material="Container_Red", ink=LIGHT, code="PLTU 902336 5"),
    "STTC": dict(name="STT CARGO LINES", emblem="chevrons", material="Container_Orange", ink=LIGHT, code="STTU 401827 4"),
}


def font(sz, w=700):
    return ImageFont.truetype(f"{FONT_DIR}/barlow-condensed-latin-{w}-normal.woff", sz)


def fit_font(d, txt, max_w, max_h, w=800, start=320):
    sz = start
    while sz > 10:
        f = font(sz, w)
        bb = d.textbbox((0, 0), txt, font=f)
        if bb[2] - bb[0] <= max_w and bb[3] - bb[1] <= max_h:
            return f, bb
        sz -= 6
    return font(10, w), d.textbbox((0, 0), txt, font=font(10, w))


def text_center(d, box, txt, f, fill):
    x0, y0, x1, y1 = box
    bb = d.textbbox((0, 0), txt, font=f)
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    d.text((x0 + (x1 - x0 - tw) / 2 - bb[0], y0 + (y1 - y0 - th) / 2 - bb[1]), txt, font=f, fill=fill)


def emblem(d, kind, cx, cy, s, fg, accent):
    """Draw an emblem of half-size s centred on (cx, cy)."""
    if kind == "chevrons":
        top, bot = cy - s, cy + s
        for i in range(3):
            bx = cx - s + i * s * 0.55
            d.polygon([(bx, top), (bx + s * 0.34, top), (bx + s * 1.04, cy), (bx + s * 0.34, bot), (bx, bot), (bx + s * 0.7, cy)],
                      fill=accent if i == 2 else fg)
    elif kind == "sun":
        for k in range(12):
            a = k * math.pi / 6
            p = [(cx + math.cos(a) * s, cy + math.sin(a) * s),
                 (cx + math.cos(a + 0.13) * s * 0.62, cy + math.sin(a + 0.13) * s * 0.62),
                 (cx + math.cos(a - 0.13) * s * 0.62, cy + math.sin(a - 0.13) * s * 0.62)]
            d.polygon(p, fill=accent)
        d.ellipse([cx - s * 0.55, cy - s * 0.55, cx + s * 0.55, cy + s * 0.55], fill=accent)
        d.ellipse([cx - s * 0.36, cy - s * 0.36, cx + s * 0.36, cy + s * 0.36], fill=fg)
    elif kind == "bars":
        for i in range(3):
            x = cx - s + i * s * 0.62
            d.polygon([(x + s * 0.45, cy - s), (x + s * 0.85, cy - s), (x + s * 0.4, cy + s), (x, cy + s)],
                      fill=accent if i == 0 else fg)
    elif kind in ("star", "star4"):
        n = 6 if kind == "star" else 4
        pts = []
        for k in range(n * 2):
            a = -math.pi / 2 + k * math.pi / n
            r = s if k % 2 == 0 else s * (0.45 if n == 6 else 0.32)
            pts.append((cx + math.cos(a) * r, cy + math.sin(a) * r))
        d.polygon(pts, fill=accent)
        d.ellipse([cx - s * 0.16, cy - s * 0.16, cx + s * 0.16, cy + s * 0.16], fill=fg)
    elif kind == "wing":
        for i in range(4):
            y = cy - s + i * s * 0.5
            L = s * (2.0 - i * 0.35)
            d.polygon([(cx - s, y), (cx - s + L, y - s * 0.1), (cx - s + L - s * 0.25, y + s * 0.32), (cx - s, y + s * 0.38)],
                      fill=accent if i == 0 else fg)
    elif kind == "leaf":
        d.ellipse([cx - s * 0.55, cy - s, cx + s * 0.55, cy + s], fill=accent)
        d.line([(cx, cy - s * 0.9), (cx, cy + s)], fill=fg, width=max(3, int(s * 0.1)))
        for k in range(3):
            yy = cy - s * 0.4 + k * s * 0.4
            d.line([(cx, yy + s * 0.2), (cx + s * 0.4, yy - s * 0.1)], fill=fg, width=max(2, int(s * 0.07)))
            d.line([(cx, yy + s * 0.2), (cx - s * 0.4, yy - s * 0.1)], fill=fg, width=max(2, int(s * 0.07)))
    elif kind == "crystal":
        pts = [(cx + math.cos(-math.pi / 2 + k * math.pi / 3) * s, cy + math.sin(-math.pi / 2 + k * math.pi / 3) * s) for k in range(6)]
        d.polygon(pts, fill=accent)
        d.polygon([(cx, cy - s), (cx + s * 0.4, cy), (cx, cy + s), (cx - s * 0.4, cy)], fill=fg)
    elif kind == "cross":
        w = s * 0.36
        d.rectangle([cx - w, cy - s, cx + w, cy + s], fill=accent)
        d.rectangle([cx - s, cy - w, cx + s, cy + w], fill=accent)
    elif kind == "belt":
        for k in range(3):
            x = cx - s * 0.8 + k * s * 0.8
            y = cy + s * 0.35 - k * s * 0.35
            d.ellipse([x - s * 0.24, y - s * 0.24, x + s * 0.24, y + s * 0.24], fill=accent)
        d.arc([cx - s, cy - s, cx + s, cy + s], 200, 340, fill=fg, width=max(3, int(s * 0.08)))
    elif kind == "crescent":
        d.ellipse([cx - s, cy - s, cx + s, cy + s], fill=accent)
        d.ellipse([cx - s * 0.45, cy - s * 1.05, cx + s * 1.35, cy + s * 0.75], fill=(0, 0, 0, 0))


def ship_logo(d, box, co, light):
    x0, y0, x1, y1 = box
    h = y1 - y0
    fg = LIGHT if light else DARK
    acc = tuple(co["accent_light" if light else "accent"]) + (255,)
    emblem(d, co["emblem"], x0 + 120, y0 + h * 0.42, 100, fg, acc)
    f, bb = fit_font(d, co["mark"], 740, 300)
    d.text((x0 + 250 - bb[0], y0 + 20 - bb[1] + (300 - (bb[3] - bb[1])) / 2), co["mark"], font=f, fill=fg)
    f2, bb2 = fit_font(d, co["tagline"], 740, 64, 600, 70)
    d.text((x0 + 256 - bb2[0], y0 + h - 110), co["tagline"], font=f2, fill=fg)


def company_atlas(key, co):
    """Same layout as decals.png: copy the generic atlas, then redraw logos + registry."""
    base = Image.open(f"{OUT}/decals.png").convert("RGBA")
    rects = json.load(open(f"{OUT}/decals.json"))["rects"]
    d = ImageDraw.Draw(base)
    for k in ("logo_dark", "logo_light", "reg_dark", "reg_light"):
        x0, y0, x1, y1 = rects[k]
        d.rectangle([x0, y0, x1 - 1, y1 - 1], fill=(0, 0, 0, 0))
    ship_logo(d, rects["logo_dark"], co, False)
    ship_logo(d, rects["logo_light"], co, True)
    text_center(d, rects["reg_dark"], co["registry"], font(250, 800), DARK)
    text_center(d, rects["reg_light"], co["registry"], font(250, 800), LIGHT)
    base.save(f"{OUT}/decals_{key}.png", optimize=True)
    json.dump({"size": 2048, "rects": rects, "company": key}, open(f"{OUT}/decals_{key}.json", "w"), indent=1)


CONT_RECTS = {"cont_logo": (0, 0, 1024, 256), "cont_code": (0, 256, 1024, 512), "grapple": (0, 512, 512, 640)}

def brand_atlas(key, b):
    S = 1024
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    ink = b["ink"]
    acc = (230, 60, 50, 255) if key == "NOVA" else ink
    emblem(d, b["emblem"], 120, 128, 92, (0, 0, 0, 0) if b["emblem"] in ("crescent",) else (40, 40, 40, 255) if ink == LIGHT else LIGHT, acc)
    words = b["name"].split(" ", 1)
    f, bb = fit_font(d, words[0], 600, 150, 800, 200)
    d.text((250 - bb[0], 30 - bb[1]), words[0], font=f, fill=ink)
    if len(words) > 1:
        f2, bb2 = fit_font(d, words[1], 740, 60, 600, 64)
        d.text((254 - bb2[0], 190 - bb2[1]), words[1], font=f2, fill=ink)
    d.text((24, 270), b["code"], font=font(120, 800), fill=ink)
    d.text((24, 410), "STT-36   MAX GROSS 36 000 KG   TARE 6 500 KG", font=font(56, 600), fill=ink)
    d.rectangle([4, 516, 508, 636], fill=YEL)
    text_center(d, CONT_RECTS["grapple"], "GRAPPLE POINT", font(84, 800), BLK)
    im.save(f"{OUT}/containers_{key}.png", optimize=True)
    json.dump({"size": S, "rects": CONT_RECTS, "brand": key}, open(f"{OUT}/containers_{key}.json", "w"), indent=1)


def to_hex(c):
    s = [max(0.0, min(1.0, v)) for v in c]
    s = [(12.92 * v if v <= 0.0031308 else 1.055 * v ** (1 / 2.4) - 0.055) for v in s]
    return "#" + "".join(f"{int(round(v * 255)):02x}" for v in s)


def main():
    for k, co in COMPANIES.items():
        company_atlas(k, co)
    for k, b in BRANDS.items():
        brand_atlas(k, b)
    meta = {
        "companies": {k: {"name": c["name"], "registry": c["registry"], "livery_linear": c["livery"],
                          "livery_dark_linear": c["livery_dark"], "livery_hex": to_hex(c["livery"]),
                          "livery_dark_hex": to_hex(c["livery_dark"]), "decals": f"textures/decals_{k}.png"}
                      for k, c in COMPANIES.items()},
        "container_brands": {k: {"name": b["name"], "container_material": "STT_" + b["material"], "code": b["code"],
                                 "decals": f"textures/containers_{k}.png"} for k, b in BRANDS.items()},
    }
    json.dump(meta, open(f"{OUT}/fleet_companies.json", "w"), indent=1)
    print(sorted(f for f in os.listdir(OUT) if f.startswith(("decals_", "containers_", "fleet"))))


if __name__ == "__main__":
    main()

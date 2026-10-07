"""Station / bay / shuttle decal atlas (company-agnostic): textures/decals_station.png + .json"""
import json, math
from PIL import Image, ImageDraw
from .gen_fleet_decals import font, text_center, DARK, LIGHT, YEL, BLK, RED, OUT

S = 1024
im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(im)
R = {}
# landing pad (512 x 512): circle + H + tick marks
R["pad"] = (0, 0, 512, 512)
cx, cy = 256, 256
d.ellipse([16, 16, 496, 496], outline=YEL, width=26)
d.ellipse([70, 70, 442, 442], outline=(*YEL[:3], 255), width=8)
for k in range(24):
    a = k * math.pi / 12
    d.line([(cx + math.cos(a) * 200, cy + math.sin(a) * 200), (cx + math.cos(a) * 228, cy + math.sin(a) * 228)], fill=YEL, width=10)
d.rectangle([cx - 110, cy - 130, cx - 70, cy + 130], fill=LIGHT)
d.rectangle([cx + 70, cy - 130, cx + 110, cy + 130], fill=LIGHT)
d.rectangle([cx - 70, cy - 20, cx + 70, cy + 20], fill=LIGHT)
# codes 256 x 64 (dark / light)
codes = ["BAY-01", "BAY-02", "NOD-01", "NOD-02", "NOD-03", "SHT-01", "TUN-01", "ELB-01"]
for i, c in enumerate(codes):
    x, y = 512 + (i % 2) * 256, (i // 2) * 64
    R[f"code_{c.lower().replace('-', '')}"] = (x, y, x + 256, y + 64)
    text_center(d, R[f"code_{c.lower().replace('-', '')}"], c, font(56, 700), DARK)
    y2 = y + 256
    R[f"code_{c.lower().replace('-', '')}_light"] = (x, y2, x + 256, y2 + 64)
    text_center(d, R[f"code_{c.lower().replace('-', '')}_light"], c, font(56, 700), LIGHT)
# plates 512 x 96
R["bay_plate"] = (0, 512, 512, 608); d.rectangle([4, 516, 508, 604], fill=YEL); text_center(d, R["bay_plate"], "SHUTTLE BAY", font(80, 800), BLK)
R["keep_clear"] = (512, 512, 1024, 608); d.rectangle([516, 516, 1020, 604], fill=RED); text_center(d, R["keep_clear"], "KEEP CLEAR OF DOORS", font(58, 800), LIGHT)
R["field"] = (0, 608, 512, 704); d.rectangle([4, 612, 508, 700], fill=(20, 120, 200, 255)); text_center(d, R["field"], "FORCE FIELD ACTIVE", font(58, 800), LIGHT)
R["dock_here"] = (512, 608, 1024, 704); d.rectangle([516, 612, 1020, 700], fill=YEL); text_center(d, R["dock_here"], "DOCKING PORT", font(80, 800), BLK)
# floor arrow (256 x 256)
R["floor_arrow"] = (0, 704, 256, 960)
d.polygon([(128, 716), (240, 840), (176, 840), (176, 948), (80, 948), (80, 840), (16, 840)], fill=YEL)
# chevron strip 768 x 64
R["chevrons"] = (256, 704, 1024, 768)
d.rectangle([256, 704, 1023, 767], fill=YEL)
for x in range(256 - 64, 1024 + 64, 48):
    d.polygon([(x, 768), (x + 24, 768), (x + 24 + 64, 704), (x + 64, 704)], fill=BLK)
d.rectangle([0, 704, 255, 767], fill=(0, 0, 0, 0))
d.polygon([(128, 716), (240, 840), (176, 840), (176, 948), (80, 948), (80, 840), (16, 840)], fill=YEL)
# zone plates 512 x 64 (row y=960)
for i, (k, txt, col, ink) in enumerate((("zone_pax", "ZONE A  -  PASSENGERS", (30, 150, 90, 255), LIGHT),
                                        ("zone_cont", "ZONE B  -  CONTAINERS", (225, 165, 20, 255), BLK))):
    x = i * 512
    R[k] = (x, 960, x + 512, 1024)
    d.rectangle([x + 4, 962, x + 508, 1022], fill=col)
    text_center(d, R[k], txt, font(50, 800), ink)
R["zone_liq"] = (256, 768, 768, 832)
d.rectangle([260, 770, 764, 830], fill=(210, 70, 20, 255)); text_center(d, R["zone_liq"], "ZONE C  -  FLUIDS", font(50, 800), LIGHT)
im2 = im.copy()
im.paste((0, 0, 0, 0), (0, 704 + 256, 256, 1024)) if False else None
im.save(f"{OUT}/decals_station.png", optimize=True)
json.dump({"size": S, "rects": R}, open(f"{OUT}/decals_station.json", "w"), indent=1)
print(sorted(R))

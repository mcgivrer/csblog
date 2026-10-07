"""Generate tileable texture sets + decal atlas for the STT Freighter (numpy + Pillow).

Tileable sets (1024 px, periodic):  <set>_albedo.png (sRGB detail, multiplied by the material colour),
<set>_orm.png (R=1, G=roughness multiplier, B=1), <set>_normal.png (OpenGL / glTF convention).
Sets: panels (4 m tile), metal (2 m), mli (1.5 m), container (3 m), solar (1 m, full colour).
Decal atlas: decals.png (2048, RGBA) + decals.json (pixel rects).
"""
import json, math, os
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUT = os.environ.get("STT_TEXTURES_OUT", "textures")
FONT_DIR = os.environ.get("STT_FONT_DIR", "fonts")
N = 1024
rng = np.random.default_rng(107)
os.makedirs(OUT, exist_ok=True)


# ------------------------------------------------------------------ helpers
def fnoise(n=N, beta=2.0, seed=None, aniso=(1.0, 1.0)):
    """Periodic fractal noise via FFT filtering, normalised to [0, 1]."""
    r = np.random.default_rng(seed) if seed is not None else rng
    w = r.standard_normal((n, n))
    fy = np.fft.fftfreq(n)[:, None] * aniso[1]
    fx = np.fft.fftfreq(n)[None, :] * aniso[0]
    f = np.sqrt(fx ** 2 + fy ** 2)
    f[0, 0] = 1.0
    out = np.real(np.fft.ifft2(np.fft.fft2(w) / f ** (beta / 2)))
    out -= out.min()
    return out / out.max()


def normal_from_height(h, strength):
    du = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5
    dv = -(np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5      # rows go down = -v
    nx, ny, nz = -du * strength, -dv * strength, np.ones_like(h)
    l = np.sqrt(nx ** 2 + ny ** 2 + nz ** 2)
    n = np.stack([nx / l, ny / l, nz / l], -1)
    return ((n * 0.5 + 0.5) * 255).clip(0, 255).astype(np.uint8)


def blur(a, r):
    im = Image.fromarray((a * 255).clip(0, 255).astype(np.uint8))
    # periodic blur: tile 3x3, blur, crop centre
    big = Image.new("L", (N * 3, N * 3))
    for i in range(3):
        for j in range(3):
            big.paste(im, (i * N, j * N))
    big = big.filter(ImageFilter.GaussianBlur(r))
    return np.asarray(big.crop((N, N, 2 * N, 2 * N))).astype(np.float32) / 255.0


def save_set(name, albedo, rough, height, nstrength):
    if albedo.ndim == 2:
        albedo = np.stack([albedo] * 3, -1)
    Image.fromarray((albedo * 255).clip(0, 255).astype(np.uint8), "RGB").save(f"{OUT}/{name}_albedo.png", optimize=True)
    orm = np.stack([np.ones_like(rough), rough, np.ones_like(rough)], -1)
    Image.fromarray((orm * 255).clip(0, 255).astype(np.uint8), "RGB").save(f"{OUT}/{name}_orm.png", optimize=True)
    Image.fromarray(normal_from_height(height, nstrength), "RGB").save(f"{OUT}/{name}_normal.png", optimize=True)


def seam_mask(cuts_img):
    """cuts_img: float map with 1 on seam pixels -> soft seam profile."""
    return blur(cuts_img, 1.2).clip(0, 1)


# ------------------------------------------------------------------ PANELS (4 m tile)
def gen_panels():
    seams = np.zeros((N, N), np.float32)
    rivets = np.zeros((N, N), np.float32)
    pid = np.zeros((N, N), np.float32)
    cols = [0, 256, 448, 704, 1024]
    k = 0
    r = np.random.default_rng(11)
    for c0, c1 in zip(cols, cols[1:]):
        seams[:, c0 % N] = 1; seams[:, (c0 + 1) % N] = 1
        n_rows = r.integers(2, 5)
        cuts = sorted(r.choice(np.arange(64, N - 64, 32), n_rows - 1, replace=False).tolist())
        off = int(r.integers(0, N))
        edges = [0] + cuts + [N]
        for a, b in zip(edges, edges[1:]):
            rows = (np.arange(a, b) + off) % N
            pid[np.ix_(rows, np.arange(c0, c1))] = r.uniform(0.94, 1.04)
            y = (a + off) % N
            seams[y, c0:c1] = 1; seams[(y + 1) % N, c0:c1] = 1
            # rivet lines along the panel top edge and sides
            for x in range(c0 + 12, c1 - 6, 18):
                rivets[(y + 6) % N, x] = 1
            for yy in range(a + 12, b - 6, 18):
                rivets[(yy + off) % N, c0 + 6] = 1
        k += 1
    # an access hatch + small sub-panels
    for (x0, y0, w, h) in ((300, 520, 110, 150), (760, 140, 180, 90), (90, 830, 120, 120)):
        seams[y0:y0 + h, x0] = 1; seams[y0:y0 + h, x0 + w] = 1
        seams[y0, x0:x0 + w] = 1; seams[y0 + h, x0:x0 + w] = 1
    s = seam_mask(seams)
    rv = blur(rivets, 0.9) * 6
    grime = fnoise(beta=2.4, seed=3)
    streak = fnoise(beta=2.2, seed=4, aniso=(6.0, 0.6))
    height = 1.0 - s * 0.9 + rv.clip(0, 1) * 0.25 + (fnoise(beta=1.2, seed=5) - 0.5) * 0.02
    albedo = pid * (1 - 0.45 * s) * (1 - 0.10 * (grime ** 2)) * (1 - 0.07 * streak)
    albedo = albedo.clip(0, 1)
    rough = (0.80 + 0.16 * grime - 0.06 * pid + 0.10 * s).clip(0, 1)
    save_set("panels", albedo, rough, height, 6.0)


# ------------------------------------------------------------------ METAL (2 m tile)
def gen_metal():
    brushed = fnoise(beta=1.8, seed=21, aniso=(0.05, 4.0))
    scratches = np.zeros((N, N), np.float32)
    r = np.random.default_rng(22)
    im = Image.new("L", (N, N), 0)
    d = ImageDraw.Draw(im)
    for _ in range(260):
        x, y = r.integers(0, N, 2)
        a = r.uniform(0, math.pi)
        L = r.uniform(20, 160)
        for ox in (-N, 0, N):
            for oy in (-N, 0, N):
                d.line([(x + ox, y + oy), (x + ox + L * math.cos(a), y + oy + L * math.sin(a))], fill=int(r.integers(60, 200)), width=1)
    scratches = np.asarray(im).astype(np.float32) / 255
    grime = fnoise(beta=2.6, seed=23)
    height = brushed * 0.3 - scratches * 0.4
    albedo = (0.92 + 0.08 * brushed - 0.12 * grime + 0.10 * scratches).clip(0, 1)
    rough = (0.78 + 0.18 * grime - 0.25 * scratches + 0.06 * brushed).clip(0, 1)
    save_set("metal", albedo, rough, height, 2.0)


# ------------------------------------------------------------------ MLI foil (1.5 m tile)
def gen_mli():
    h1 = fnoise(beta=2.0, seed=31)
    h2 = fnoise(beta=1.6, seed=32)
    crinkle = np.abs(h1 - 0.5) * 2
    crinkle = 1 - crinkle ** 0.6
    height = crinkle * 0.7 + h2 * 0.3
    # quilting stitches every 0.25 m (grid of dots)
    st = np.zeros((N, N), np.float32)
    step = N // 6
    for y in range(0, N, step):
        for x in range(0, N, step):
            st[y, x] = 1
    st = blur(st, 2.5) * 30
    height = height - st.clip(0, 1) * 0.6
    albedo = (0.82 + 0.25 * h2 - 0.12 * crinkle).clip(0, 1)
    rough = (0.55 + 0.45 * crinkle).clip(0, 1)
    save_set("mli", albedo, rough, blur(height, 1.0), 5.0)


# ------------------------------------------------------------------ CONTAINER (3 m tile)
def gen_container():
    streak = fnoise(beta=2.0, seed=41, aniso=(5.0, 0.3))
    rust = fnoise(beta=2.6, seed=42)
    rust_m = ((rust - 0.74) * 5).clip(0, 1) * 0.8
    chips = (fnoise(beta=0.8, seed=43) > 0.88).astype(np.float32)
    chips = blur(chips, 0.7)
    base = (0.95 - 0.18 * streak ** 1.5).clip(0, 1)
    rust_col = np.array([0.55, 0.32, 0.18])
    albedo = np.stack([base] * 3, -1)
    albedo = albedo * (1 - rust_m[..., None]) + rust_col * rust_m[..., None] * 1.4
    albedo = albedo * (1 - 0.35 * chips[..., None]) + 0.35 * chips[..., None] * np.array([0.7, 0.7, 0.7])
    height = -streak * 0.1 - chips * 0.4 + rust_m * 0.2
    rough = (0.80 + 0.2 * rust_m + 0.05 * streak - 0.2 * chips).clip(0, 1)
    save_set("container", albedo.clip(0, 1), rough, height, 3.0)


# ------------------------------------------------------------------ SOLAR (1 m tile, full colour)
def gen_solar():
    cells = 8
    cs = N // cells
    yy, xx = np.mgrid[0:N, 0:N]
    gx, gy = xx % cs, yy % cs
    gap = ((gx < 3) | (gy < 3)).astype(np.float32)
    finger = ((gy % 16) == 8).astype(np.float32) * (1 - gap)
    bus = (((gx - cs // 3) % (cs // 3)) < 2).astype(np.float32) * (1 - gap)
    var = fnoise(beta=1.0, seed=51)
    cell_id = ((xx // cs) * 7 + (yy // cs) * 13) % 5 / 5.0
    cellc = np.array([0.035, 0.06, 0.20])
    col = np.ones((N, N, 3)) * cellc * (0.85 + 0.25 * cell_id[..., None] + 0.1 * var[..., None])
    col = col * (1 - gap[..., None]) + np.array([0.75, 0.76, 0.78]) * gap[..., None]
    lines = np.maximum(finger * 0.6, bus)
    col = col * (1 - lines[..., None]) + np.array([0.70, 0.70, 0.72]) * lines[..., None]
    height = -gap * 0.5 + lines * 0.15
    rough = (0.25 + 0.5 * gap + 0.2 * lines).clip(0, 1)
    save_set("solar", col.clip(0, 1), rough, height, 2.0)


# ------------------------------------------------------------------ DECAL ATLAS
def font(sz, w=700):
    return ImageFont.truetype(f"{FONT_DIR}/barlow-condensed-latin-{w}-normal.woff", sz)

def gen_decals():
    A = 2048
    im = Image.new("RGBA", (A, A), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    rects = {}
    DARK, LIGHT = (32, 34, 38, 255), (236, 236, 232, 255)
    BLUE = (14, 70, 150, 255)
    YEL, BLK, RED = (222, 160, 10, 255), (18, 18, 18, 255), (190, 30, 24, 255)

    def text_center(box, txt, f, fill):
        x0, y0, x1, y1 = box
        bb = d.textbbox((0, 0), txt, font=f)
        tw, th = bb[2] - bb[0], bb[3] - bb[1]
        d.text((x0 + (x1 - x0 - tw) / 2 - bb[0], y0 + (y1 - y0 - th) / 2 - bb[1]), txt, font=f, fill=fill)

    def logo(box, fg, accent):
        x0, y0, x1, y1 = box
        w, h = x1 - x0, y1 - y0
        # chevron bars
        top, bot = y0 + 40, y0 + h * 0.80
        mid = (top + bot) / 2
        for i in range(3):
            bx = x0 + 18 + i * 62
            d.polygon([(bx, top), (bx + 38, top), (bx + 38 + 78, mid), (bx + 38, bot), (bx, bot), (bx + 78, mid)],
                      fill=accent if i == 2 else fg)
        f = font(300, 800)
        d.text((x0 + 250, y0 + 8), "STT", font=f, fill=fg)
        f2 = font(62, 600)
        d.text((x0 + 256, y0 + h - 120), "SPACE TRAVEL & TRANSPORT", font=f2, fill=fg)

    # row 0: logos (dark / light)
    rects["logo_dark"] = (0, 0, 1024, 512); logo(rects["logo_dark"], DARK, BLUE)
    rects["logo_light"] = (1024, 0, 2048, 512); logo(rects["logo_light"], LIGHT, (90, 150, 230, 255))
    # row 1: registry
    rects["reg_dark"] = (0, 512, 1024, 768); text_center(rects["reg_dark"], "STT-0107", font(250, 800), DARK)
    rects["reg_light"] = (1024, 512, 2048, 768); text_center(rects["reg_light"], "STT-0107", font(250, 800), LIGHT)
    # rows 2-3: module codes (dark) 512 x 128, light variants at y=1792/1920
    codes = ["CMD-01", "PAX-01", "CRG-01", "TNK-01", "PWR-01", "PRP-01"]
    light_pos = [(0, 1920), (512, 1920), (1024, 1920), (1536, 1920), (1024, 1792), (1536, 1792)]
    for i, cde in enumerate(codes):
        x = (i % 4) * 512; y = 768 + (i // 4) * 128
        k = cde[:3].lower()
        rects[f"code_{k}"] = (x, y, x + 512, y + 128)
        text_center(rects[f"code_{k}"], cde, font(110, 700), DARK)
        lx, ly = light_pos[i]
        rects[f"code_{k}_light"] = (lx, ly, lx + 512, ly + 128)
        text_center(rects[f"code_{k}_light"], cde, font(110, 700), LIGHT)
    rects["code_crg2"] = (1024, 896, 1536, 1024); text_center(rects["code_crg2"], "CRG-02", font(110, 700), DARK)
    rects["code_crg2_light"] = (1536, 896, 2048, 1024); text_center(rects["code_crg2_light"], "CRG-02", font(110, 700), LIGHT)
    for i in range(6):     # slot numbers 1-6 (yellow boxes)
        x = 1280 + i * 128
        rects[f"slot_{i + 1}"] = (x, 1024, x + 128, 1152)
        d.rectangle([x + 6, 1030, x + 122, 1146], fill=YEL)
        text_center((x, 1024, x + 128, 1152), str(i + 1), font(110, 800), BLK)
    # signs 256 x 256 at y=1024
    def tri_sign(box, kind):
        x0, y0, x1, y1 = box
        m = 12
        d.polygon([((x0 + x1) / 2, y0 + m), (x1 - m, y1 - m), (x0 + m, y1 - m)], fill=BLK)
        d.polygon([((x0 + x1) / 2, y0 + m + 26), (x1 - m - 22, y1 - m - 13), (x0 + m + 22, y1 - m - 13)], fill=YEL)
        cx, cy = (x0 + x1) / 2, y0 + (y1 - y0) * 0.62
        if kind == "rad":
            d.ellipse([cx - 12, cy - 12, cx + 12, cy + 12], fill=BLK)
            for k in range(3):
                a0 = -90 + k * 120 - 30
                d.pieslice([cx - 62, cy - 62, cx + 62, cy + 62], a0, a0 + 60, fill=BLK)
            d.ellipse([cx - 20, cy - 20, cx + 20, cy + 20], fill=YEL)
            d.ellipse([cx - 12, cy - 12, cx + 12, cy + 12], fill=BLK)
        else:
            d.polygon([(cx + 10, cy - 70), (cx - 28, cy + 6), (cx + 2, cy + 6), (cx - 14, cy + 66), (cx + 30, cy - 14),
                       (cx + 2, cy - 14), (cx + 22, cy - 70)], fill=BLK)
    rects["sign_rad"] = (0, 1024, 256, 1280); tri_sign(rects["sign_rad"], "rad")
    rects["sign_volt"] = (256, 1024, 512, 1280); tri_sign(rects["sign_volt"], "volt")
    # docking target
    rects["dock_target"] = (512, 1024, 768, 1280)
    x0, y0, x1, y1 = rects["dock_target"]; cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    d.ellipse([x0 + 16, y0 + 16, x1 - 16, y1 - 16], outline=LIGHT, width=10)
    d.rectangle([cx - 5, y0 + 8, cx + 5, y1 - 8], fill=LIGHT); d.rectangle([x0 + 8, cy - 5, x1 - 8, cy + 5], fill=LIGHT)
    # slot letters (yellow boxes) 128 x 128
    for i, L in enumerate("ABCD"):
        x = 768 + i * 128
        rects[f"slot_{L}"] = (x, 1024, x + 128, 1152)
        d.rectangle([x + 6, 1030, x + 122, 1146], fill=YEL)
        text_center((x, 1024, x + 128, 1152), L, font(110, 800), BLK)
    # text plates 512 x 128 (row y=1280)
    rects["eva"] = (0, 1280, 512, 1408)
    d.rectangle([4, 1284, 508, 1404], fill=YEL); text_center((0, 1280, 512, 1408), "◀ EVA AIRLOCK ▶".replace("◀", "<").replace("▶", ">"), font(84, 800), BLK)
    rects["nostep"] = (512, 1280, 896, 1408); text_center(rects["nostep"], "NO STEP", font(84, 800), DARK)
    rects["plume"] = (896, 1280, 2048, 1408)
    d.rectangle([900, 1284, 2044, 1404], fill=RED); text_center(rects["plume"], "DANGER  DRIVE PLUME  KEEP CLEAR", font(84, 800), LIGHT)
    rects["pod"] = (0, 1792, 512, 1920)
    d.rectangle([4, 1796, 508, 1916], fill=(230, 90, 20, 255)); text_center(rects["pod"], "ESCAPE POD", font(84, 800), BLK)
    rects["grapple"] = (512, 1792, 1024, 1920)
    d.rectangle([516, 1796, 1020, 1916], fill=YEL); text_center(rects["grapple"], "GRAPPLE POINT", font(84, 800), BLK)
    # container codes 1024 x 256 (dark) row y=1408
    rects["cont_code"] = (0, 1408, 1024, 1664)
    d.text((24, 1420), "STTU 401827 4", font=font(120, 800), fill=LIGHT)
    d.text((24, 1550), "STT-36   MAX GROSS 36 000 KG   TARE 6 500 KG", font=font(56, 600), fill=LIGHT)
    rects["cont_logo"] = (1024, 1408, 2048, 1664)
    d.text((1044, 1400), "STT", font=font(230, 800), fill=LIGHT)
    d.text((1420, 1470), "CARGO\nLINES", font=font(80, 700), fill=LIGHT, spacing=-4)
    # hazard chevron strip 1024 x 128 row y=1664
    rects["chevrons"] = (0, 1664, 1024, 1792)
    d.rectangle([0, 1664, 1024, 1792], fill=YEL)
    for x in range(-128, 1024 + 128, 96):
        d.polygon([(x, 1792), (x + 48, 1792), (x + 48 + 128, 1664), (x + 128, 1664)], fill=BLK)
    d.rectangle([1024, 1664, 1400, 1792], fill=(0, 0, 0, 0))
    d.rectangle([-10, 1664, -1, 1792], fill=(0, 0, 0, 0))
    # arrows
    rects["arrow"] = (1024, 1664, 1280, 1792)
    d.polygon([(1040, 1712), (1190, 1712), (1190, 1684), (1264, 1728), (1190, 1772), (1190, 1744), (1040, 1744)], fill=YEL)
    im.save(f"{OUT}/decals.png", optimize=True)
    with open(f"{OUT}/decals.json", "w") as fjs:
        json.dump({"size": A, "rects": rects}, fjs, indent=1)


def main():
    import sys
    if "--decals" in sys.argv:
        gen_decals()
    else:
        gen_panels(); gen_metal(); gen_mli(); gen_container(); gen_solar(); gen_decals()
    print(sorted(os.listdir(OUT)))


if __name__ == "__main__":
    main()

# Generates tex/hair_strands3.png: near-black brown fine-strand hair card (256x1024 RGBA), sRGB colours baked in.
# Root at top (v=1) dense, tips at bottom sparse/feathered. Left half denser, right half wispier.
import numpy as np
from PIL import Image, ImageFilter
rng = np.random.default_rng(7)
W, H = 256, 1024
col = np.zeros((H, W, 3), np.float32); alpha = np.zeros((H, W), np.float32)
base = np.array([0.062, 0.043, 0.034])      # sRGB dark brown
hi = np.array([0.13, 0.09, 0.07])           # occasional lighter strand
for half, n, lmin in ((0, 2600, 0.45), (1, 1500, 0.25)):
    for i in range(n):
        x0 = rng.uniform(half * W / 2 + 4, (half + 1) * W / 2 - 4); L = rng.uniform(lmin, 1.0) * H
        y0 = rng.uniform(0, 0.04) * H
        drift = rng.normal(0, 5); b = rng.lognormal(0, 0.28)
        ys = np.arange(int(y0), int(min(H, y0 + L))); t = np.clip((ys - y0) / L, 0, 1)
        xs = x0 + drift * t ** 1.5 + np.sin(ys / rng.uniform(60, 200) + rng.uniform(0, 6)) * rng.uniform(0, 2.0)
        xi = xs.astype(int); ok = (xi >= half * W // 2) & (xi < (half + 1) * W // 2 - 1)
        fade = 1.0 - t ** 3
        a = rng.uniform(0.85, 1.0) * fade
        c0 = hi if rng.random() < 0.05 else base
        c = c0[None, :] * b * (1 + 0.25 * np.sin(ys * rng.uniform(0.008, 0.02) + i))[:, None]
        yy, xx = ys[ok], xi[ok]
        alpha[yy, xx] = np.maximum(alpha[yy, xx], a[ok]); alpha[yy, xx + 1] = np.maximum(alpha[yy, xx + 1], a[ok] * 0.5)
        m = alpha[yy, xx] <= a[ok] + 1e-6
        col[yy[m], xx[m]] = c[ok][m]; col[yy, xx + 1] = np.maximum(col[yy, xx + 1], c[ok] * 0.85)
xx = np.linspace(0, 1, W); xh = (xx * 2) % 1.0
edge = np.clip(np.minimum(xh, 1 - xh) * 3.5, 0, 1) ** 1.5
alpha *= edge[None, :]
root = np.clip(1 - np.linspace(0, 1, H) * 6.0, 0, 1)[:, None] * edge[None, :]
alpha = np.maximum(alpha, root * 0.9)
col = np.where(col.sum(2, keepdims=True) > 0, col, base * 0.6)
img = np.dstack([np.clip(col, 0, 1), alpha[..., None]])
Image.fromarray((img * 255).astype(np.uint8), 'RGBA').filter(ImageFilter.GaussianBlur(0.3)).save('/workspace/bb3d/tex/hair_strands3.png')
print("ok")

# Generates tex/hair_strands2.png: dark, fine-strand hair card (256x1024 RGBA). Root at top (v=1), tips at bottom.
import numpy as np
from PIL import Image, ImageFilter
rng = np.random.default_rng(11)
W, H = 256, 1024
col = np.zeros((H, W, 3), np.float32); alpha = np.zeros((H, W), np.float32)
base = np.array([0.10, 0.068, 0.048])
for i in range(1800):
    x0 = rng.uniform(6, W - 6); L = rng.uniform(0.5, 1.0) * H
    drift = rng.normal(0, 7); b = rng.lognormal(0, 0.35)
    ys = np.arange(int(L)); t = ys / H
    xs = x0 + drift * t ** 1.6 + np.sin(ys / rng.uniform(50, 160) + rng.uniform(0, 6)) * rng.uniform(0, 2.5)
    xi = xs.astype(int); ok = (xi >= 0) & (xi < W - 1)
    fade = 1.0 - (ys / L) ** 2.5
    a = rng.uniform(0.8, 1.0) * fade
    c = base[None, :] * b * (1 + 0.3 * np.sin(ys * rng.uniform(0.01, 0.03) + i))[:, None]
    yy, xx = ys[ok], xi[ok]
    alpha[yy, xx] = np.maximum(alpha[yy, xx], a[ok]); alpha[yy, xx + 1] = np.maximum(alpha[yy, xx + 1], a[ok] * 0.55)
    col[yy, xx] = np.maximum(col[yy, xx], c[ok]); col[yy, xx + 1] = np.maximum(col[yy, xx + 1], c[ok] * 0.8)
xx = np.linspace(0, 1, W); edge = np.clip(np.minimum(xx, 1 - xx) * 5, 0, 1)
alpha *= edge[None, :]
root = np.clip(1 - np.linspace(0, 1, H) * 3.0, 0, 1)[:, None] * edge[None, :]
alpha = np.maximum(alpha, root * 0.85)
col = np.where(col.sum(2, keepdims=True) > 0, col, base * 0.7)
img = np.dstack([np.clip(col, 0, 1), alpha[..., None]])
Image.fromarray((img * 255).astype(np.uint8), 'RGBA').filter(ImageFilter.GaussianBlur(0.25)).save('/workspace/bb3d/tex/hair_strands2.png')
print("ok")

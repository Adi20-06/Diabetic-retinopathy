import cv2, numpy as np, pandas as pd, matplotlib
matplotlib.use("Agg"); import matplotlib.pyplot as plt
from iqa import fundus_mask

def lesions(img, bright_th=30, dark_th=22):
    g = cv2.createCLAHE(2.0, (8, 8)).apply(img[:, :, 1])
    m = cv2.erode(fundus_mask(img).astype(np.uint8), np.ones((41, 41), np.uint8)).astype(bool)
    bl = cv2.GaussianBlur(g, (0, 0), 25); bl[~m] = 0
    ox, oy = cv2.minMaxLoc(bl)[3]                                   # optic disc ~ brightest blob
    disc = np.zeros(g.shape, np.uint8); cv2.circle(disc, (ox, oy), 60, 1, -1)
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (21, 21))
    resp = {"exudate-like": (cv2.morphologyEx(g, cv2.MORPH_TOPHAT, k), bright_th, (255, 220, 0)),
            "haemorrhage-like": (cv2.morphologyEx(g, cv2.MORPH_BLACKHAT, k), dark_th, (0, 200, 255))}
    ov, counts = cv2.cvtColor(img, cv2.COLOR_BGR2RGB).copy(), {}
    for name, (r, th, col) in resp.items():
        b = ((r > th) & m & ~disc.astype(bool)).astype(np.uint8)
        n, lab, st, _ = cv2.connectedComponentsWithStats(b)
        keep = np.zeros_like(b); c = 0
        for i in range(1, n):
            x, y, w, h, a = st[i]
            if 12 <= a <= 1500 and max(w, h) / max(1, min(w, h)) < 2.5 and a / (w * h) > 0.45:
                keep[lab == i] = 1; c += 1                           # compact blobs only (drops vessels)
        cs, _ = cv2.findContours(keep, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        cv2.drawContours(ov, cs, -1, col, 2); counts[name] = c
    return ov, counts

if __name__ == "__main__":
    df = pd.read_csv("data/splits.csv"); df = df[df.split == "test"]
    fig, ax = plt.subplots(2, 5, figsize=(20, 8.5))
    for lvl in range(5):
        n = df[df.level == lvl].sample(1, random_state=3).image.iloc[0]
        img = cv2.imread(f"data/proc512/{n}.jpeg"); ov, c = lesions(img)
        ax[0, lvl].imshow(cv2.cvtColor(img, cv2.COLOR_BGR2RGB)); ax[1, lvl].imshow(ov)
        ax[0, lvl].set_title(f"true grade {lvl}"); ax[1, lvl].set_title(f"yellow {c['exudate-like']}  blue {c['haemorrhage-like']}")
        ax[0, lvl].axis("off"); ax[1, lvl].axis("off")
    plt.tight_layout(); plt.savefig("outputs/lesions.png", dpi=110); print("saved outputs/lesions.png")
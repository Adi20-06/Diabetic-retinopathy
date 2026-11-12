import pandas as pd, cv2, numpy as np
from iqa import assess

df = pd.read_csv("data/splits.csv")
val = df[df.split == "val"].sample(1000, random_state=1)

# Part 1: how many real val images get rejected, and why
rej, why = 0, {}
for n in val.image:
    r = assess(cv2.imread(f"data/proc512/{n}.jpeg"))
    if not r["gradable"]:
        rej += 1
        for x in r["reasons"]: why[x] = why.get(x, 0) + 1
print("Rejected:", rej, "/ 1000"); print(why)

# Part 2: do deliberately damaged images get caught?
img = cv2.imread(f"data/proc512/{val.image.iloc[0]}.jpeg")
M = np.float32([[1, 0, 90], [0, 1, 60]])
tests = {
    "original": img,
    "blur": cv2.GaussianBlur(img, (0, 0), 6),
    "dark": (img * 0.25).astype(np.uint8),
    "bright": np.clip(img * 2.2, 0, 255).astype(np.uint8),
    "off-centre": cv2.warpAffine(img, M, (512, 512)),
}
for k, v in tests.items():
    r = assess(v); print(k, "->", "OK" if r["gradable"] else r["reasons"])
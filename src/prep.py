import pandas as pd, cv2, numpy as np, os
from pathlib import Path
from sklearn.model_selection import GroupShuffleSplit
from multiprocessing import Pool

RAW, OUT, SIZE = Path("data/raw/train"), Path("data/proc512"), 512

def crop_resize(name):
    dst = OUT / f"{name}.jpeg"
    if dst.exists(): return
    img = cv2.imread(str(RAW / f"{name}.jpeg"))
    if img is None: return
    m = img.mean(2) > 10                      # crop black borders
    if m.any():
        ys, xs = np.where(m)
        img = img[ys.min():ys.max()+1, xs.min():xs.max()+1]
    img = cv2.resize(img, (SIZE, SIZE), interpolation=cv2.INTER_AREA)
    cv2.imwrite(str(dst), img, [cv2.IMWRITE_JPEG_QUALITY, 95])

if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    df = pd.read_csv("data/trainLabels.csv")        # columns: image, level
    df["patient"] = df.image.str.split("_").str[0]  # 10_left / 10_right -> patient 10
    df["referable"] = (df.level >= 2).astype(int)

    g = GroupShuffleSplit(1, test_size=0.2, random_state=42)
    tr, rest = next(g.split(df, groups=df.patient))
    rest_df = df.iloc[rest]
    g2 = GroupShuffleSplit(1, test_size=0.5, random_state=42)
    va, te = next(g2.split(rest_df, groups=rest_df.patient))
    df.loc[df.index[tr], "split"] = "train"
    df.loc[rest_df.index[va], "split"] = "val"
    df.loc[rest_df.index[te], "split"] = "test"
    df.to_csv("data/splits.csv", index=False)
    print(df.split.value_counts(), df.level.value_counts().sort_index())

    with Pool(os.cpu_count()) as p:
        p.map(crop_resize, df.image.tolist(), chunksize=64)
    print("done")
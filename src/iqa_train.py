import cv2, numpy as np, pandas as pd, torch, timm
from torch.utils.data import Dataset, DataLoader
from sklearn.metrics import f1_score
from iqa import assess

DEF = ["blurry", "too_dark", "over_exposed", "glare", "off_centre"]
MEAN, STD = np.float32([0.485, 0.456, 0.406]), np.float32([0.229, 0.224, 0.225])

def degrade(img, rng):
    y = np.zeros(5, np.float32)
    if rng.random() < 0.35: return img, y                      # keep some clean
    ks = rng.choice(5, size=rng.integers(1, 3), replace=False)
    if 1 in ks and 2 in ks: ks = ks[ks != 2]                  # dark+bright contradict
    for k in ks:
        y[k] = 1
        if k == 0: img = cv2.GaussianBlur(img, (0, 0), rng.uniform(4, 9))
        elif k == 1: img = (img * rng.uniform(0.15, 0.35)).astype(np.uint8)
        elif k == 2: img = np.clip(img * rng.uniform(1.8, 2.6) + 20, 0, 255).astype(np.uint8)
        elif k == 3:
            m = np.zeros(img.shape[:2], np.float32)
            for _ in range(rng.integers(1, 3)):
                cv2.circle(m, (int(rng.integers(150, 360)), int(rng.integers(150, 360))), int(rng.integers(40, 90)), 1, -1)
            m = cv2.GaussianBlur(m, (0, 0), 15)[..., None]
            img = np.clip(img * (1 - m) + 255 * m, 0, 255).astype(np.uint8)
        else:
            dx = rng.choice([-1, 1]) * rng.uniform(70, 130); dy = rng.choice([-1, 1]) * rng.uniform(50, 110)
            img = cv2.warpAffine(img, np.float32([[1, 0, dx], [0, 1, dy]]), (512, 512))
    return img, y

class QDS(Dataset):
    def __init__(s, names, fixed): s.n, s.fixed = list(names), fixed
    def __len__(s): return len(s.n)
    def __getitem__(s, i):
        rng = np.random.default_rng(1000 + i if s.fixed else None)
        img, y = degrade(cv2.imread(f"data/proc512/{s.n[i]}.jpeg"), rng)
        x = cv2.resize(cv2.cvtColor(img, cv2.COLOR_BGR2RGB), (256, 256), interpolation=cv2.INTER_AREA)
        x = (x.astype(np.float32) / 255 - MEAN) / STD
        return torch.from_numpy(x.transpose(2, 0, 1)), torch.from_numpy(y)

if __name__ == "__main__":
    df = pd.read_csv("data/splits.csv")
    ok = lambda names: [n for n in names if assess(cv2.imread(f"data/proc512/{n}.jpeg"))["gradable"]]
    tr = ok(df[df.split == "train"].image.sample(7000, random_state=0))
    va = ok(df[df.split == "val"].image.sample(1500, random_state=0))
    print(len(tr), "train /", len(va), "val source images")

    model = timm.create_model("resnet18", pretrained=True, num_classes=5).cuda()
    opt = torch.optim.AdamW(model.parameters(), 3e-4)
    lossf = torch.nn.BCEWithLogitsLoss()
    dl = DataLoader(QDS(tr, False), 32, shuffle=True, num_workers=4, persistent_workers=True)
    for ep in range(1, 5):
        model.train(); tot = 0
        for x, y in dl:
            loss = lossf(model(x.cuda()), y.cuda())
            opt.zero_grad(); loss.backward(); opt.step(); tot += loss.item()
        print(f"ep{ep} loss {tot/len(dl):.4f}", flush=True)

    model.eval(); P, Y = [], []
    with torch.no_grad():
        for x, y in DataLoader(QDS(va, True), 64, num_workers=4):
            P.append(torch.sigmoid(model(x.cuda())).cpu().numpy()); Y.append(y.numpy())
    P, Y = np.concatenate(P) > 0.5, np.concatenate(Y)
    for i, d in enumerate(DEF): print(d, "F1", round(f1_score(Y[:, i], P[:, i]), 3))
    print("gradable vs not accuracy", ((Y.sum(1) == 0) == (P.sum(1) == 0)).mean().round(3))
    torch.save(model.state_dict(), "outputs/iqa_net.pt")
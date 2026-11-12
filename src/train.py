import argparse, time, cv2, numpy as np, pandas as pd, torch, timm
import albumentations as A
from albumentations.pytorch import ToTensorV2
from torch.utils.data import Dataset, DataLoader
from sklearn.metrics import cohen_kappa_score, roc_auc_score

import os; os.makedirs("outputs", exist_ok=True)

p = argparse.ArgumentParser()
p.add_argument("--epochs", type=int, default=15)
p.add_argument("--img", type=int, default=384)
p.add_argument("--bs", type=int, default=16)
p.add_argument("--limit", type=int, default=0)   # >0 = tiny smoke test
a = p.parse_args()

MEAN, STD = (0.485, 0.456, 0.406), (0.229, 0.224, 0.225)
def tf(train):
    t = [A.Resize(a.img, a.img)]
    if train:
        t += [A.HorizontalFlip(), A.VerticalFlip(),
              A.Rotate(limit=180, border_mode=cv2.BORDER_CONSTANT),
              A.RandomBrightnessContrast(0.2, 0.2)]
    return A.Compose(t + [A.Normalize(MEAN, STD), ToTensorV2()])

class DS(Dataset):
    def __init__(s, df, train): s.df, s.t = df.reset_index(drop=True), tf(train)
    def __len__(s): return len(s.df)
    def __getitem__(s, i):
        r = s.df.iloc[i]
        img = cv2.cvtColor(cv2.imread(f"data/proc512/{r.image}.jpeg"), cv2.COLOR_BGR2RGB)
        return s.t(image=img)["image"], int(r.level)

if __name__ == "__main__":
    df = pd.read_csv("data/splits.csv")
    tr, va = df[df.split == "train"], df[df.split == "val"]
    if a.limit: tr, va = tr.sample(a.limit, random_state=0), va.sample(a.limit // 2, random_state=0)
    dl_tr = DataLoader(DS(tr, True), a.bs, shuffle=True, num_workers=4, drop_last=True, persistent_workers=True)
    dl_va = DataLoader(DS(va, False), a.bs * 2, num_workers=4, persistent_workers=True)

    dev = "cuda"
    model = timm.create_model("resnet50", pretrained=True, num_classes=5).to(dev)
    cnt = np.bincount(tr.level, minlength=5)
    w = (cnt.sum() / np.maximum(cnt, 1)) ** 0.5; w = w / w.mean()
    loss_fn = torch.nn.CrossEntropyLoss(weight=torch.tensor(w, dtype=torch.float32, device=dev))
    opt = torch.optim.AdamW(model.parameters(), lr=3e-4, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, 3e-4, total_steps=a.epochs * len(dl_tr))
    scaler = torch.amp.GradScaler("cuda")
    best, log = -1, []

    for ep in range(1, a.epochs + 1):
        model.train(); t0 = time.time(); tot = 0
        for x, y in dl_tr:
            x, y = x.to(dev), y.to(dev)
            with torch.autocast("cuda"):
                loss = loss_fn(model(x), y)
            opt.zero_grad(); scaler.scale(loss).backward()
            scaler.step(opt); scaler.update(); sched.step(); tot += loss.item()
        model.eval(); P, Y = [], []
        with torch.no_grad(), torch.autocast("cuda"):
            for x, y in dl_va:
                P.append(torch.softmax(model(x.to(dev)).float(), 1).cpu().numpy()); Y.append(y.numpy())
        P, Y = np.concatenate(P), np.concatenate(Y)
        qwk = cohen_kappa_score(Y, P.argmax(1), weights="quadratic")
        auc = roc_auc_score(Y >= 2, P[:, 2:].sum(1))
        print(f"ep{ep} loss {tot/len(dl_tr):.3f} val QWK {qwk:.3f} refAUROC {auc:.3f} {time.time()-t0:.0f}s", flush=True)
        log.append(dict(epoch=ep, loss=tot/len(dl_tr), qwk=qwk, auroc=auc))
        pd.DataFrame(log).to_csv("outputs/log.csv", index=False)
        if qwk > best: best = qwk; torch.save(model.state_dict(), "outputs/best.pt")
import json, cv2, numpy as np, pandas as pd, torch, timm
from torch.utils.data import Dataset, DataLoader
from sklearn.metrics import cohen_kappa_score, roc_auc_score
from train import tf
from iqa import assess
from calibrate import ece

def blur(i):   return cv2.GaussianBlur(i, (0, 0), 4)
def dark(i):   return (i * 0.35).astype(np.uint8)
def bright(i): return np.clip(i * 1.8 + 20, 0, 255).astype(np.uint8)
def jpeg(i):   return cv2.imdecode(cv2.imencode(".jpg", i, [cv2.IMWRITE_JPEG_QUALITY, 10])[1], 1)
def lowres(i): return cv2.resize(cv2.resize(i, (96, 96), interpolation=cv2.INTER_AREA), (512, 512))
def offc(i):   return cv2.warpAffine(i, np.float32([[1, 0, 70], [0, 1, 50]]), (512, 512))
C = {"clean": lambda i: i, "blur": blur, "low-light": dark, "over-exposed": bright,
     "jpeg q10": jpeg, "low-res 96px": lowres, "off-centre": offc}

class DS2(Dataset):
    def __init__(s, df, cname): s.df, s.c, s.t = df.reset_index(drop=True), cname, tf(False)
    def __len__(s): return len(s.df)
    def __getitem__(s, i):
        r = s.df.iloc[i]
        img = C[s.c](cv2.imread(f"data/proc512/{r.image}.jpeg"))
        ok = assess(img)["gradable"]
        x = s.t(image=cv2.cvtColor(img, cv2.COLOR_BGR2RGB))["image"]
        return x, int(r.level), ok

if __name__ == "__main__":
    cal = json.load(open("outputs/calib.json"))
    model = timm.create_model("resnet50", pretrained=False, num_classes=5)
    model.load_state_dict(torch.load("outputs/best.pt")); model = model.cuda().eval()
    df = pd.read_csv("data/splits.csv"); df = df[df.split == "test"].sample(1200, random_state=0)

    rows = []
    for name in C:
        P, Y, OK = [], [], []
        with torch.no_grad(), torch.autocast("cuda"):
            for x, y, ok in DataLoader(DS2(df, name), 32, num_workers=4):
                P.append(torch.softmax(model(x.cuda()).float() / cal["T"], 1).cpu().numpy())
                Y.append(y.numpy()); OK.append(ok.numpy())
        P, Y, OK = np.concatenate(P), np.concatenate(Y), np.concatenate(OK)
        ref = P[:, 2:].sum(1)
        row = dict(condition=name,
                   QWK=cohen_kappa_score(Y, P.argmax(1), weights="quadratic"),
                   AUROC=roc_auc_score(Y >= 2, ref), ECE=ece(P, Y),
                   gate_reject_pct=100 * (~OK).mean())
        if OK.sum() > 50:
            row["QWK_accepted"] = cohen_kappa_score(Y[OK], P[OK].argmax(1), weights="quadratic")
            row["AUROC_accepted"] = roc_auc_score(Y[OK] >= 2, ref[OK])
        rows.append(row); print(row, flush=True)

    out = pd.DataFrame(rows).round(3)
    out.to_csv("outputs/robustness.csv", index=False)
    print(out.to_string(index=False))
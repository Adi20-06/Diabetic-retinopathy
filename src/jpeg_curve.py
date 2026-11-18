import json, cv2, numpy as np, pandas as pd, torch, timm
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from torch.utils.data import DataLoader
from sklearn.metrics import cohen_kappa_score, roc_auc_score
from robust import DS2, C
from calibrate import ece
import os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

def make(q): return lambda i: cv2.imdecode(cv2.imencode(".jpg", i, [cv2.IMWRITE_JPEG_QUALITY, q])[1], 1)
QS = [95, 90, 80, 70, 60, 50, 40, 30, 20, 10]
for q in QS: C[f"q{q}"] = make(q)

if __name__ == "__main__":
    cal = json.load(open("outputs/calib.json"))
    model = timm.create_model("resnet50", pretrained=False, num_classes=5)
    model.load_state_dict(torch.load("outputs/best.pt")); model = model.cuda().eval()
    df = pd.read_csv("data/splits.csv"); df = df[df.split == "test"].sample(1200, random_state=0)

    rows = []
    for name in ["clean"] + [f"q{q}" for q in QS]:
        P, Y, OK = [], [], []
        with torch.no_grad(), torch.autocast("cuda"):
            for x, y, ok in DataLoader(DS2(df, name), 32, num_workers=4):
                P.append(torch.softmax(model(x.cuda()).float() / cal["T"], 1).cpu().numpy())
                Y.append(y.numpy()); OK.append(ok.numpy())
        P, Y, OK = np.concatenate(P), np.concatenate(Y), np.concatenate(OK)
        rows.append(dict(condition=name, QWK=cohen_kappa_score(Y, P.argmax(1), weights="quadratic"),
                         AUROC=roc_auc_score(Y >= 2, P[:, 2:].sum(1)), ECE=ece(P, Y), gate_reject_pct=100 * (~OK).mean()))
        print(rows[-1], flush=True)

    out = pd.DataFrame(rows).round(3)
    out.to_csv("outputs/jpeg_curve.csv", index=False)
    print(out.to_string(index=False))

    # Rule fixed in advance: accept a quality level if QWK drops by at most 0.05 and AUROC by at most 0.02.
    base = out[out.condition == "clean"].iloc[0]
    suggested = None
    for q in sorted(QS, reverse=True):
        r = out[out.condition == f"q{q}"].iloc[0]
        if r.QWK >= base.QWK - 0.05 and r.AUROC >= base.AUROC - 0.02: suggested = q
        else: break
    print(f"\nSuggested minimum JPEG quality: {suggested}")

    xs = QS[::-1]
    fig, ax = plt.subplots(figsize=(6, 4))
    ax.plot(xs, [out[out.condition == f"q{q}"].QWK.iloc[0] for q in xs], "o-", label="QWK")
    ax.plot(xs, [out[out.condition == f"q{q}"].AUROC.iloc[0] for q in xs], "s-", label="Referable AUROC")
    ax.axhline(base.QWK, ls=":", c="gray"); ax.set(xlabel="JPEG quality", ylabel="Score", title="Accuracy vs compression"); ax.legend()
    plt.tight_layout(); plt.savefig("outputs/jpeg_curve.png", dpi=150)
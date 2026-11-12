import json, numpy as np, pandas as pd, torch, timm
from scipy.optimize import minimize_scalar
from torch.utils.data import DataLoader
from sklearn.metrics import cohen_kappa_score, roc_auc_score
from train import DS

def ece(P, Y, n=15):
    c, ok, e = P.max(1), P.argmax(1) == Y, 0
    for lo in np.linspace(0, 1, n + 1)[:-1]:
        m = (c > lo) & (c <= lo + 1 / n)
        if m.any(): e += m.mean() * abs(ok[m].mean() - c[m].mean())
    return e

def entropy(P): return -(P * np.log(P + 1e-12)).sum(1)

if __name__ == "__main__":
    dev = "cuda"
    df = pd.read_csv("data/splits.csv")
    model = timm.create_model("resnet50", pretrained=False, num_classes=5)
    model.load_state_dict(torch.load("outputs/best.pt")); model.to(dev).eval()

    def get_logits(d):
        L, Y = [], []
        with torch.no_grad(), torch.autocast("cuda"):
            for x, y in DataLoader(DS(d, False), 32, num_workers=4):
                L.append(model(x.to(dev)).float().cpu()); Y.append(y)
        return torch.cat(L), torch.cat(Y)

    Lv, Yv = get_logits(df[df.split == "val"])
    Lt, Yt = get_logits(df[df.split == "test"])

    T = minimize_scalar(lambda t: torch.nn.functional.cross_entropy(Lv / t, Yv).item(),
                        bounds=(0.5, 5), method="bounded").x
    sm = lambda L, t=1.0: torch.softmax(L / t, 1).numpy()
    Pv, Pt0, Pt = sm(Lv, T), sm(Lt), sm(Lt, T)
    yv, yt = Yv.numpy(), Yt.numpy()
    print(f"Temperature T = {T:.3f}")
    print(f"TEST ECE before {ece(Pt0, yt):.4f}  after {ece(Pt, yt):.4f}  (target < 0.05)")
    print(f"TEST QWK {cohen_kappa_score(yt, Pt.argmax(1), weights='quadratic'):.3f}  "
          f"refAUROC {roc_auc_score(yt >= 2, Pt[:, 2:].sum(1)):.3f}")

    # referable threshold: highest threshold keeping val sensitivity >= 90%
    rv, rt = Pv[:, 2:].sum(1), Pt[:, 2:].sum(1)
    thr = max(t for t in np.linspace(0.01, 0.99, 99) if (rv[yv >= 2] >= t).mean() >= 0.93)
    sens = (rt[yt >= 2] >= thr).mean(); spec = (rt[yt < 2] < thr).mean()
    print(f"Referable threshold {thr:.2f}: TEST sensitivity {sens:.3f}  specificity {spec:.3f}")

    # uncertainty: flag the 10% highest-entropy val cases
    tau = np.percentile(entropy(Pv), 90)
    unc = entropy(Pt) > tau
    keep = ~unc
    print(f"Uncertain on test: {unc.mean()*100:.1f}%  entropy cutoff {tau:.3f}")
    print(f"Confident-only QWK {cohen_kappa_score(yt[keep], Pt[keep].argmax(1), weights='quadratic'):.3f}  "
          f"refAUROC {roc_auc_score(yt[keep] >= 2, rt[keep]):.3f}  "
          f"sensitivity {(rt[keep & (yt >= 2)] >= thr).mean():.3f}")
    refer = unc | (rt >= thr)
    print(f"System sensitivity (referable or uncertain -> referred): {refer[yt >= 2].mean():.3f}  referral rate {refer.mean():.3f}")

    json.dump(dict(T=float(T), ref_thr=float(thr), entropy_tau=float(tau)), open("outputs/calib.json", "w"))
    np.save("outputs/test_probs.npy", Pt); np.save("outputs/test_labels.npy", yt)
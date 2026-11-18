"""External validation on APTOS 2019 (train set). Frozen model, frozen calibration. Run from src: python external.py"""
import json, time
from pathlib import Path
import numpy as np, pandas as pd, cv2, onnxruntime as ort
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from scipy.optimize import minimize_scalar
from sklearn.metrics import roc_auc_score, roc_curve, cohen_kappa_score, confusion_matrix
from iqa import assess

ROOT = Path(__file__).resolve().parent.parent
IMGS, CSV, OUT = ROOT / "data/aptos/train_images", ROOT / "data/aptos/train.csv", ROOT / "outputs"
CAL = json.load(open(OUT / "calib.json"))
T, TAU, THR = CAL["T"], CAL["entropy_tau"], CAL["ref_thr"]
MEAN, STD = np.float32([0.485, 0.456, 0.406]), np.float32([0.229, 0.224, 0.225])
CACHE = OUT / "aptos_raw.npz"

def preprocess_512(img):                       # same steps as training and the backend
    m = img.mean(2) > 10
    if m.any():
        ys, xs = np.where(m); img = img[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    return cv2.resize(img, (512, 512), interpolation=cv2.INTER_AREA)

def run_model():
    df = pd.read_csv(CSV)
    sess = ort.InferenceSession(str(OUT / "dr.onnx"), providers=["CPUExecutionProvider"])
    name = sess.get_inputs()[0].name
    logits = np.zeros((len(df), 5), np.float32); gate = np.zeros(len(df), bool); reasons = []
    t0 = time.time()
    for i, row in enumerate(df.itertuples()):
        img = cv2.imread(str(IMGS / f"{row.id_code}.png"))
        if img is None: raise SystemExit(f"Cannot read {row.id_code}.png")
        img = preprocess_512(img)
        q = assess(img); gate[i] = bool(q["gradable"]); reasons.append("; ".join(q["reasons"]))
        x = (cv2.resize(cv2.cvtColor(img, cv2.COLOR_BGR2RGB), (384, 384)).astype(np.float32) / 255 - MEAN) / STD
        logits[i] = sess.run(None, {name: x.transpose(2, 0, 1)[None].astype(np.float32)})[0][0]
        if (i + 1) % 200 == 0:
            print(f"  {i + 1}/{len(df)}  ({(time.time() - t0) / 60:.1f} min)", flush=True)
    np.savez(CACHE, logits=logits, gate=gate, y=df.diagnosis.values, ids=df.id_code.values, reasons=np.array(reasons))

def softmax(z, t):
    z = z / t; z = z - z.max(1, keepdims=True); p = np.exp(z); return p / p.sum(1, keepdims=True)
def entropy(p): return -(p * np.log(p + 1e-12)).sum(1)
def ece(conf, ok, bins=15):
    e = np.linspace(0, 1, bins + 1); tot = 0.0
    for lo, hi in zip(e[:-1], e[1:]):
        m = (conf > lo) & (conf <= hi)
        if m.any(): tot += m.mean() * abs(ok[m].mean() - conf[m].mean())
    return tot

def quick(y, p):
    true_ref, ref_p = y >= 2, p[:, 2:].sum(1)
    hat, sysref = ref_p >= THR, (ref_p >= THR) | (entropy(p) > TAU)
    return dict(auroc=roc_auc_score(true_ref, ref_p), sens=hat[true_ref].mean(), spec=(~hat[~true_ref]).mean(),
                sys_sens=sysref[true_ref].mean(), sys_spec=(~sysref[~true_ref]).mean())

def full(y, logits, t=T):
    p = softmax(logits, t); pred = p.argmax(1)
    m = dict(n=int(len(y)), referable_prevalence=float((y >= 2).mean()), acc5=float((pred == y).mean()),
             qwk=float(cohen_kappa_score(y, pred, weights="quadratic")), uncertain_rate=float((entropy(p) > TAU).mean()),
             ece5=float(ece(p.max(1), pred == y)))
    m.update({k: float(v) for k, v in quick(y, p).items()})
    return m

def bootstrap(y, logits, n=1000):
    rng, p, out = np.random.default_rng(0), softmax(logits, T), {k: [] for k in ("auroc", "sens", "spec", "sys_sens")}
    for _ in range(n):
        i = rng.integers(0, len(y), len(y)); r = quick(y[i], p[i])
        for k in out: out[k].append(r[k])
    return {k: [float(np.percentile(v, 2.5)), float(np.percentile(v, 97.5))] for k, v in out.items()}

def show(title, m):
    print(f"\n{title}  (n = {m['n']}, referable prevalence {m['referable_prevalence']:.1%})")
    print(f"  5-class accuracy {m['acc5']:.3f} | QWK {m['qwk']:.3f} | ECE (5-class) {m['ece5']:.3f}")
    print(f"  Referable: AUROC {m['auroc']:.3f} | sensitivity {m['sens']:.3f} | specificity {m['spec']:.3f}")
    print(f"  With Uncertain sent to referral: sensitivity {m['sys_sens']:.3f} | specificity {m['sys_spec']:.3f} | uncertain rate {m['uncertain_rate']:.1%}")

if __name__ == "__main__":
    if not CACHE.exists():
        print("Running the frozen model on APTOS (CPU, roughly 10-20 minutes). Results are cached.")
        run_model()
    d = np.load(CACHE, allow_pickle=True)
    y, logits, gate, reasons = d["y"], d["logits"], d["gate"], d["reasons"]
    res = {"all": full(y, logits), "gate_pass": full(y[gate], logits[gate])}
    if (~gate).sum() > 50 and len(set(y[~gate] >= 2)) == 2: res["gate_fail"] = full(y[~gate], logits[~gate])
    res["ci95_all"] = bootstrap(y, logits)

    print(f"\nQuality gate: {gate.sum()} passed, {(~gate).sum()} rejected as ungradable ({(~gate).mean():.1%})")
    from collections import Counter
    c = Counter(r for rs in reasons[~gate] for r in rs.split("; ") if r)
    for k, v in c.most_common(): print(f"   {v:5d}  {k}")
    show("ALL IMAGES (gate ignored)", res["all"])
    show("GATE-PASSED IMAGES (what the deployed system would analyse)", res["gate_pass"])
    if "gate_fail" in res: show("GATE-REJECTED IMAGES (for information)", res["gate_fail"])
    ci = res["ci95_all"]
    print("\n95% bootstrap intervals (all images):", {k: f"{v[0]:.3f}-{v[1]:.3f}" for k, v in ci.items()})

    # How far has calibration drifted? Diagnostic only, never used for the headline numbers.
    nll = lambda t: -np.log(softmax(logits, t)[np.arange(len(y)), y] + 1e-12).mean()
    t_new = float(minimize_scalar(nll, bounds=(0.3, 5), method="bounded").x)
    res["calibration_shift"] = dict(T_internal=T, T_refit_on_aptos=t_new, ece5_with_T=res["all"]["ece5"], ece5_with_refit=full(y, logits, t_new)["ece5"])
    print(f"\nCalibration shift: internal T = {T:.3f}, best T on APTOS = {t_new:.3f}, ECE {res['all']['ece5']:.3f} -> {res['calibration_shift']['ece5_with_refit']:.3f} if refit")

    p = softmax(logits, T); pred = p.argmax(1)
    cm = confusion_matrix(y, pred, labels=range(5))
    pd.DataFrame(cm, index=[f"true_{i}" for i in range(5)], columns=[f"pred_{i}" for i in range(5)]).to_csv(OUT / "aptos_confusion.csv")
    print("\nConfusion matrix (rows = true grade, columns = predicted grade):\n", cm)
    print("Per-grade recall:", {i: round(float(cm[i, i] / cm[i].sum()), 3) for i in range(5)})
    json.dump(res, open(OUT / "aptos_results.json", "w"), indent=2)

    fig, ax = plt.subplots(1, 3, figsize=(15, 4.4))
    for name, mask in (("all images", np.ones(len(y), bool)), ("gate-passed", gate)):
        fpr, tpr, _ = roc_curve(y[mask] >= 2, p[mask][:, 2:].sum(1))
        ax[0].plot(fpr, tpr, label=f"{name} (AUROC {roc_auc_score(y[mask] >= 2, p[mask][:, 2:].sum(1)):.3f})")
    ax[0].plot([0, 1], [0, 1], "k:"); ax[0].set(title="Referable DR: ROC (APTOS)", xlabel="1 - specificity", ylabel="Sensitivity"); ax[0].legend(loc="lower right")
    conf, ok = p.max(1), pred == y; e = np.linspace(0, 1, 11)
    xs = [(conf[(conf > a) & (conf <= b)]).mean() for a, b in zip(e[:-1], e[1:]) if ((conf > a) & (conf <= b)).any()]
    ys = [(ok[(conf > a) & (conf <= b)]).mean() for a, b in zip(e[:-1], e[1:]) if ((conf > a) & (conf <= b)).any()]
    ax[1].plot([0, 1], [0, 1], "k:"); ax[1].plot(xs, ys, "o-"); ax[1].set(title=f"Reliability (ECE {res['all']['ece5']:.3f})", xlabel="Confidence", ylabel="Accuracy")
    ax[2].imshow(cm, cmap="Blues"); ax[2].set(title="Confusion matrix", xlabel="Predicted", ylabel="True", xticks=range(5), yticks=range(5))
    for i in range(5):
        for j in range(5): ax[2].text(j, i, cm[i, j], ha="center", va="center", color="white" if cm[i, j] > cm.max() / 2 else "black")
    plt.tight_layout(); plt.savefig(OUT / "aptos_validation.png", dpi=150)
    print("\nSaved: outputs/aptos_results.json, aptos_confusion.csv, aptos_validation.png")
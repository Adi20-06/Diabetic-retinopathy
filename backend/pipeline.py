import json, numpy as np, cv2, onnxruntime as ort, torch, timm
from pathlib import Path
from pytorch_grad_cam import GradCAMPlusPlus
from pytorch_grad_cam.utils.image import show_cam_on_image
from pytorch_grad_cam.utils.model_targets import ClassifierOutputTarget

D = Path(__file__).parent / "model"
CAL = json.load(open(D / "calib.json"))
MODEL_VERSION = "resnet50-v1"
sess = ort.InferenceSession(str(D / "dr.onnx"), providers=["CPUExecutionProvider"])
_pt = timm.create_model("resnet50", pretrained=False, num_classes=5)
_pt.load_state_dict(torch.load(D / "best.pt", map_location="cpu")); _pt.eval()
_cam = GradCAMPlusPlus(model=_pt, target_layers=[_pt.layer4[-1]])
MEAN, STD = np.float32([0.485, 0.456, 0.406]), np.float32([0.229, 0.224, 0.225])

def preprocess_512(raw: bytes):
    img = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
    if img is None: raise ValueError("not an image")
    m = img.mean(2) > 10
    if m.any():
        ys, xs = np.where(m); img = img[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    return cv2.resize(img, (512, 512), interpolation=cv2.INTER_AREA)

def predict(img512):
    x = (cv2.resize(cv2.cvtColor(img512, cv2.COLOR_BGR2RGB), (384, 384)).astype(np.float32) / 255 - MEAN) / STD
    x = x.transpose(2, 0, 1)[None].astype(np.float32)
    lg = sess.run(None, {"input": x})[0][0] / CAL["T"]
    p = np.exp(lg - lg.max()); p /= p.sum()
    ref, H = float(p[2:].sum()), float(-(p * np.log(p + 1e-12)).sum())
    triage = "Uncertain" if H > CAL["entropy_tau"] else ("Referable" if ref >= CAL["ref_thr"] else "Non-referable")
    return dict(probs=p.tolist(), grade=int(p.argmax()), referable_prob=ref, entropy=H, triage=triage), x

def heatmap(img512, x, grade):
    g = _cam(input_tensor=torch.from_numpy(x), targets=[ClassifierOutputTarget(grade)])[0]
    base = cv2.resize(cv2.cvtColor(img512, cv2.COLOR_BGR2RGB), (384, 384)).astype(np.float32) / 255
    ov = show_cam_on_image(base, g, use_rgb=True)
    return cv2.imencode(".jpg", cv2.cvtColor(ov, cv2.COLOR_RGB2BGR))[1].tobytes()
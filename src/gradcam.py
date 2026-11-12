import json, cv2, numpy as np, pandas as pd, torch, timm, matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from pytorch_grad_cam import GradCAMPlusPlus
from pytorch_grad_cam.utils.image import show_cam_on_image
from pytorch_grad_cam.utils.model_targets import ClassifierOutputTarget
from train import tf

cal = json.load(open("outputs/calib.json"))
model = timm.create_model("resnet50", pretrained=False, num_classes=5)
model.load_state_dict(torch.load("outputs/best.pt")); model = model.cuda().eval()
cam = GradCAMPlusPlus(model=model, target_layers=[model.layer4[-1]])
tfm = tf(False)
df = pd.read_csv("data/splits.csv"); df = df[df.split == "test"]

def explain(name):
    rgb = cv2.cvtColor(cv2.imread(f"data/proc512/{name}.jpeg"), cv2.COLOR_BGR2RGB)
    x = tfm(image=rgb)["image"].unsqueeze(0).cuda()
    with torch.no_grad(): p = torch.softmax(model(x) / cal["T"], 1)[0].cpu().numpy()
    k = int(p.argmax())
    g = cam(input_tensor=x, targets=[ClassifierOutputTarget(k)])[0]
    base = cv2.resize(rgb, (384, 384)).astype(np.float32) / 255
    return base, show_cam_on_image(base, g, use_rgb=True), p

fig, ax = plt.subplots(2, 5, figsize=(20, 8.5))
for lvl in range(5):
    name = df[df.level == lvl].sample(1, random_state=3).image.iloc[0]
    base, ov, p = explain(name)
    H = -(p * np.log(p + 1e-12)).sum()
    flag = "UNCERTAIN" if H > cal["entropy_tau"] else ""
    ax[0, lvl].imshow(base); ax[1, lvl].imshow(ov)
    ax[0, lvl].set_title(f"true grade {lvl}", fontsize=13)
    ax[1, lvl].set_title(f"pred {p.argmax()}  conf {p.max():.2f}  {flag}", fontsize=12)
    for r in (0, 1): ax[r, lvl].axis("off")
plt.tight_layout(); plt.savefig("outputs/gradcam.png", dpi=110)
print("saved outputs/gradcam.png")
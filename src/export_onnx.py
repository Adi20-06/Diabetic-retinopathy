import time, cv2, numpy as np, pandas as pd, torch, timm, onnxruntime as ort
from iqa import assess

model = timm.create_model("resnet50", pretrained=False, num_classes=5)
model.load_state_dict(torch.load("outputs/best.pt")); model = model.cpu().eval()
dummy = torch.randn(1, 3, 384, 384)
torch.onnx.export(model, dummy, "outputs/dr.onnx", input_names=["input"], output_names=["logits"],
                  dynamic_axes={"input": {0: "b"}, "logits": {0: "b"}}, opset_version=17, dynamo=False)

sess = ort.InferenceSession("outputs/dr.onnx", providers=["CPUExecutionProvider"])
with torch.no_grad(): ref = model(dummy).numpy()
print("max abs diff torch vs onnx:", np.abs(ref - sess.run(None, {"input": dummy.numpy()})[0]).max())

MEAN, STD = np.float32([0.485, 0.456, 0.406]), np.float32([0.229, 0.224, 0.225])
name = pd.read_csv("data/splits.csv").query("split=='test'").image.iloc[0]
img = cv2.imread(f"data/proc512/{name}.jpeg")

def run():
    t0 = time.perf_counter(); assess(img)
    t1 = time.perf_counter()
    x = (cv2.resize(cv2.cvtColor(img, cv2.COLOR_BGR2RGB), (384, 384)).astype(np.float32) / 255 - MEAN) / STD
    x = x.transpose(2, 0, 1)[None].astype(np.float32)
    t2 = time.perf_counter(); sess.run(None, {"input": x}); t3 = time.perf_counter()
    return t1 - t0, t2 - t1, t3 - t2

run()
r = np.mean([run() for _ in range(20)], axis=0)
print(f"IQA {r[0]*1000:.0f} ms | preprocess {r[1]*1000:.0f} ms | ONNX inference {r[2]*1000:.0f} ms | total {r.sum():.2f} s per eye (target < 2.0 s)")
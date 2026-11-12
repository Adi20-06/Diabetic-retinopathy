import pandas as pd, cv2, numpy as np
from iqa import metrics

df = pd.read_csv("data/splits.csv")
df = df[df.split == "train"].sample(2000, random_state=0)
rows = [metrics(cv2.imread(f"data/proc512/{n}.jpeg")) for n in df.image]
r = pd.DataFrame(rows)
print(r.describe(percentiles=[.01, .05, .5, .95, .99]).round(3))
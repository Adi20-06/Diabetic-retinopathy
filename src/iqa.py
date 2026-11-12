import cv2, numpy as np

def fundus_mask(img):
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    m = (gray > 15).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8))
    return m.astype(bool)

def metrics(img):
    """img: BGR uint8 image. Returns raw quality numbers."""
    m = fundus_mask(img)
    g = img[:, :, 1]                                 # green channel shows detail best
    area = m.mean()                                  # fraction of image that is retina
    if m.sum() < 100:
        return dict(blur=0, bright=0, glare=0, offset=1, area=0)
    lap = cv2.Laplacian(g, cv2.CV_64F)
    ys, xs = np.where(m)
    h, w = m.shape
    offset = np.hypot((xs.mean() - w / 2) / w, (ys.mean() - h / 2) / h)
    glare = (img.min(axis=2)[m] > 240).mean()        # all channels very bright
    return dict(blur=lap[m].var(), bright=g[m].mean(), glare=glare,
                offset=offset, area=area)

# Thresholds: placeholders, we will calibrate them from data in the next run
TH = dict(blur_min=9, bright_min=32, bright_max=170, glare_max=0.02,
          offset_max=0.06, area_min=0.60)

def assess(img, th=TH):
    mt = metrics(img)
    reasons = []
    if mt["blur"] < th["blur_min"]:      reasons.append("Image is blurry, hold the camera steady and refocus")
    if mt["bright"] < th["bright_min"]:  reasons.append("Image too dark, improve illumination")
    if mt["bright"] > th["bright_max"]:  reasons.append("Image over-exposed, reduce light")
    if mt["glare"] > th["glare_max"]:    reasons.append("Glare detected, adjust camera angle")
    if mt["offset"] > th["offset_max"] or mt["area"] < th["area_min"]:
        reasons.append("Eye not centred, realign the camera")
    return dict(gradable=not reasons, reasons=reasons, metrics=mt)
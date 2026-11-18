import io
import numpy as np
from PIL import Image

MIN_QUALITY = 80   # set this from the curve: the suggested value printed by jpeg_curve.py

_STD = [16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56,
        14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92,
        49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99]
_ZZ = [0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28,
       35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63]
_STD_ZZ = [_STD[i] for i in _ZZ]

def quality_from_table(table):
    """libjpeg scales the standard table by 5000/Q (Q<50) or 200-2Q (Q>=50). Invert that."""
    t = np.array(table, float)
    if t.size != 64: return None
    best = None
    for std in (_STD, _STD_ZZ):            # Pillow's table order differs between versions: try both
        s = np.array(std, float)
        keep = (t > 1) & (t < 255)         # entries clamped at 1 or 255 carry no information
        if keep.sum() < 16: return None
        r = t[keep] / s[keep]
        cv = r.std() / r.mean()
        if best is None or cv < best[0]: best = (cv, r.mean())
    cv, ratio = best
    if cv > 0.25: return None              # custom (non-libjpeg) table: cannot judge
    scale = ratio * 100
    q = 5000 / scale if scale > 100 else (200 - scale) / 2
    return float(np.clip(q, 1, 100))

def estimate_quality(raw: bytes):
    """Estimated JPEG quality (1-100) of an uploaded file, or None if it is not a JPEG or cannot be judged."""
    try:
        im = Image.open(io.BytesIO(raw))
        if im.format != "JPEG": return None
        t = im.quantization.get(0)
    except Exception:
        return None
    return quality_from_table(t) if t else None
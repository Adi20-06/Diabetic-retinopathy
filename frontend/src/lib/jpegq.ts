export const MIN_JPEG_QUALITY = 70; // keep equal to MIN_QUALITY in backend/jpegq.py

const STD = [16,11,10,16,24,40,51,61,12,12,14,19,26,58,60,55,14,13,16,24,40,57,69,56,14,17,22,29,51,87,80,62,18,22,37,56,68,109,103,77,24,35,55,64,81,104,113,92,49,64,78,87,103,121,120,101,72,92,95,98,112,100,103,99];
const ZZ = [0,1,8,16,9,2,3,10,17,24,32,25,18,11,4,5,12,19,26,33,40,48,41,34,27,20,13,6,7,14,21,28,35,42,49,56,57,50,43,36,29,22,15,23,30,37,44,51,58,59,52,45,38,31,39,46,53,60,61,54,47,55,62,63];
const STD_ZZ = ZZ.map((i) => STD[i]);

function fromTable(t: number[]): number | null {
  let best: { cv: number; mean: number } | null = null;
  for (const std of [STD, STD_ZZ]) {
    const r: number[] = [];
    t.forEach((v, i) => { if (v > 1 && v < 255) r.push(v / std[i]); });
    if (r.length < 16) return null;
    const mean = r.reduce((a, b) => a + b, 0) / r.length;
    const sd = Math.sqrt(r.reduce((a, b) => a + (b - mean) ** 2, 0) / r.length);
    if (!best || sd / mean < best.cv) best = { cv: sd / mean, mean };
  }
  if (!best || best.cv > 0.25) return null;        // custom table: cannot judge
  const scale = best.mean * 100;
  const q = scale > 100 ? 5000 / scale : (200 - scale) / 2;
  return Math.max(1, Math.min(100, q));
}

/** Estimated JPEG quality (1-100) read from the file header, or null if it is not a JPEG or cannot be judged. */
export async function estimateJpegQuality(blob: Blob): Promise<number | null> {
  const buf = new Uint8Array(await blob.slice(0, 200_000).arrayBuffer()); // the tables sit in the header
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 4 < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m === 0xff) { i++; continue; }
    if (m === 0xda) break;                          // start of image data: no more tables
    const len = (buf[i + 2] << 8) | buf[i + 3];
    if (m === 0xdb) {
      let p = i + 4;
      const end = i + 2 + len;
      while (p < end) {
        const precision = buf[p] >> 4, id = buf[p] & 15;
        p++;
        if (precision !== 0) { p += 128; continue; }
        const t = Array.from(buf.slice(p, p + 64));
        p += 64;
        if (id === 0) return fromTable(t);
      }
    }
    i += 2 + len;
  }
  return null;
}
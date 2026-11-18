import type { Screening } from "./db";

export const GRADES = ["No DR", "Mild", "Moderate", "Severe", "Proliferative"];
const TAU = 1.007;      // from calib.json (uncertain-state entropy threshold)
const REF_THR = 0.09;   // from calib.json (referable threshold)

export type EyeAi = {
  probs: number[];        // 5 grade probabilities
  grade: number;          // argmax
  referableProb: number;  // p2 + p3 + p4
  referable: boolean;
  entropy: number;
  uncertain: boolean;
};

/** Small seeded random generator so the same checksum always gives the same numbers. */
export function seeded(text: string): () => number {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i++) { h = Math.imul(h ^ text.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function mockAi(checksum: string): EyeAi {
  const r = seeded(checksum);
  const fav = Math.floor(r() * 5);
  const logits = [0, 1, 2, 3, 4].map((i) => r() * 1.2 + (i === fav ? 2.2 : 0));
  const m = Math.max(...logits);
  const ex = logits.map((l) => Math.exp(l - m));
  const sum = ex.reduce((a, b) => a + b, 0);
  const probs = ex.map((e) => e / sum);
  const entropy = -probs.reduce((a, p) => a + (p > 0 ? p * Math.log(p) : 0), 0);
  const referableProb = probs[2] + probs[3] + probs[4];
  return {
    probs,
    grade: probs.indexOf(Math.max(...probs)),
    referableProb,
    referable: referableProb >= REF_THR,
    entropy,
    uncertain: entropy > TAU,
  };
}

export type Priority = "referable" | "uncertain" | "awaiting AI" | "non-referable";
export const RANK: Record<Priority, number> = { referable: 0, uncertain: 1, "awaiting AI": 2, "non-referable": 3 };

export function priorityOf(s: Screening): Priority {
  const r = Object.values(s.aiResult ?? {}) as EyeAi[];
  if (r.length === 0) return "awaiting AI";
  if (r.some((x) => x.referable)) return "referable";
  if (r.some((x) => x.uncertain)) return "uncertain";
  return "non-referable";
}
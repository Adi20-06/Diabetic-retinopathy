"use client";
import { useEffect, useState } from "react";

const DB = "dr_images";
const STORE = "blobs";

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export async function putBlob(key: string, blob: Blob): Promise<void> {
  const db = await open();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(blob, key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
  db.close();
}

export async function getBlob(key: string): Promise<Blob | undefined> {
  const db = await open();
  const blob = await new Promise<Blob | undefined>((res, rej) => {
    const r = db.transaction(STORE).objectStore(STORE).get(key);
    r.onsuccess = () => res(r.result as Blob | undefined);
    r.onerror = () => rej(r.error);
  });
  db.close();
  return blob;
}

export async function sha256(blob: Blob): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Processing copy: re-encoded JPEG, longest side at most 1024 px. The original is never changed. */
export async function processingCopy(blob: Blob, maxSide = 1024): Promise<Blob> {
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("encode failed"))), "image/jpeg", 0.92));
}

export type Check = { id: string; label: string; ok: boolean; detail: string };

export async function validateImage(file: Blob): Promise<{ checks: Check[]; ok: boolean; width: number; height: number }> {
  let width = 0, height = 0, decodes = false;
  try {
    const bmp = await createImageBitmap(file);
    width = bmp.width; height = bmp.height; decodes = true;
    bmp.close();
  } catch {}
  const formatOk = ["image/jpeg", "image/png"].includes(file.type);
  const ratio = height ? width / height : 0;
  const orientOk = decodes && ratio >= 0.8 && ratio <= 1.8;
  const checks: Check[] = [
    { id: "format", label: "File format", ok: formatOk, detail: formatOk ? file.type.replace("image/", "").toUpperCase() : "Use a JPEG or PNG image" },
    { id: "integrity", label: "Image integrity", ok: decodes && file.size > 10_000,
      detail: !decodes ? "Image could not be read" : file.size > 10_000 ? "Image opens correctly" : "File is very small, may be corrupted" },
    { id: "resolution", label: "Resolution", ok: decodes && Math.min(width, height) >= 512,
      detail: decodes ? `${width} × ${height} px (minimum 512 px)` : "Unknown" },
    { id: "orientation", label: "Orientation", ok: orientOk,
      detail: !decodes ? "Unknown" : orientOk ? "Landscape or square" : height > width ? "Portrait image, rotate the camera" : "Unusual shape, check the cropping" },
  ];
  return { checks, ok: checks.every((c) => c.ok), width, height };
}

/** Object URL for a stored image (undefined key gives null). */
export function useBlobUrl(key: string | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let u: string | null = null;
    if (key) {
      getBlob(key).then((b) => {
        if (b && alive) { u = URL.createObjectURL(b); setUrl(u); }
      });
    }
    return () => { alive = false; if (u) URL.revokeObjectURL(u); };
  }, [key]);
  return key ? url : null;
}
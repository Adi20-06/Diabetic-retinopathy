"use client";
import { Eye } from "lucide-react";
import { useBlobUrl } from "@/lib/images";

export default function EyeThumb({ imageKey, className = "" }: { imageKey?: string; className?: string }) {
  const url = useBlobUrl(imageKey);
  return (
    <div className={`grid aspect-square place-items-center overflow-hidden rounded-xl bg-deep ${className}`}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="Captured fundus" className="size-full object-cover" />
      ) : (
        <Eye className="size-8 text-white/30" aria-hidden="true" />
      )}
    </div>
  );
}
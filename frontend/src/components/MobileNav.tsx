"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, X } from "lucide-react";
import { NAV } from "@/lib/nav";
import { logout, useSession } from "@/lib/auth";

export default function MobileNav() {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const router = useRouter();
  const session = useSession();

  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!session) return null;
  const items = (NAV[session.role] ?? []) as { href: string; label: string }[];

  return (
    <div className="lg:hidden print:hidden">
      <button type="button" aria-label="Open menu" onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-40 grid size-14 place-items-center rounded-full bg-navy text-white shadow-lg ring-2 ring-gold">
        <Menu className="size-6" aria-hidden="true" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-deep/60" onClick={() => setOpen(false)} />
          <nav role="dialog" aria-modal="true" aria-label="Main menu" className="absolute left-0 top-0 flex h-full w-72 max-w-[85%] flex-col bg-navy p-4 text-white">
            <div className="mb-4 flex items-center justify-between">
              <span className="font-display text-lg font-semibold text-gold">DR Triage</span>
              <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="grid size-10 place-items-center rounded-lg hover:bg-white/10"><X className="size-5" /></button>
            </div>
            <ul className="flex-1 overflow-y-auto">
              {items.map((i) => (
                <li key={i.href}>
                  <Link href={i.href} className={`block rounded-lg px-3 py-3 text-sm ${path === i.href ? "bg-white/10 font-semibold text-gold" : "text-white/85 hover:bg-white/10"}`}>{i.label}</Link>
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => { logout(); router.push("/login"); }} className="mt-3 flex items-center gap-2 rounded-lg px-3 py-3 text-sm text-white/85 hover:bg-white/10">
              <LogOut className="size-4" aria-hidden="true" /> Log out
            </button>
          </nav>
        </div>
      )}
    </div>
  );
}
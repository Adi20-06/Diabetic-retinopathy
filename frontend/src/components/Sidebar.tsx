"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Eye, LogOut } from "lucide-react";
import { NAV, ROLE_LABEL, type Role } from "@/lib/nav";
import { logout } from "@/lib/auth";

export default function Sidebar({ role }: { role: Role }) {
  const path = usePathname();
  return (
    <aside className="hidden w-72 shrink-0 flex-col gap-8 bg-navy px-5 py-7 text-white lg:flex print:hidden max-lg:hidden">
      <div className="flex items-center gap-3 px-2">
        <div className="grid size-11 place-items-center rounded-xl bg-gold/15 ring-1 ring-gold/40">
          <Eye className="size-5 text-gold" aria-hidden="true" />
        </div>
        <div>
          <div className="font-display text-xl leading-none">DR Triage</div>
          <div className="mt-1.5 text-xs text-white/60">{ROLE_LABEL[role]}</div>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto" aria-label="Main">
        {NAV[role].map(({ label, href, icon: Icon }) => {
          const active = path === href || path.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                active ? "bg-white/10 font-medium text-white" : "text-white/70 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Icon className={`size-[18px] ${active ? "text-gold" : ""}`} aria-hidden="true" />
              <span className="flex-1">{label}</span>
              {active && <span className="size-1.5 rounded-full bg-gold" />}
            </Link>
          );
        })}
      </nav>

      <Link href="/login" onClick={logout} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-white/70 transition hover:bg-white/5 hover:text-white">
        <LogOut className="size-[18px]" aria-hidden="true" /> Logout
      </Link>
    </aside>
  );
}
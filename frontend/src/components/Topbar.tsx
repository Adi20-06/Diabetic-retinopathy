"use client";
import { Bell, Search, Wifi, WifiOff } from "lucide-react";
import { ROLE_LABEL, type Role } from "@/lib/nav";
import { useSession } from "@/lib/auth";
import { useOnline } from "@/lib/online";

export default function Topbar({ role }: { role: Role }) {
  const session = useSession();
  const online = useOnline();
  const name = session?.name ?? "";
  const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <header className="flex items-center gap-4 border-b border-deep/10 bg-white px-6 py-3 lg:px-10 print:hidden">
      <label className="relative max-w-md flex-1">
        <span className="sr-only">Search patients</span>
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
        <input
          type="search"
          placeholder="Search patient by ID or name"
          className="h-11 w-full rounded-xl border border-deep/10 bg-page pl-10 pr-3 text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/30"
        />
      </label>
      <div className="ml-auto flex items-center gap-3">
        <span className={`hidden items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium sm:inline-flex ${online ? "bg-ok-bg text-ok" : "bg-gold-light text-warn"}`}>
  {online ? <Wifi className="size-3.5" aria-hidden="true" /> : <WifiOff className="size-3.5" aria-hidden="true" />}
  {online ? "Online" : "Offline"}
</span>
        <button type="button" aria-label="Notifications" className="grid size-11 place-items-center rounded-xl text-ink transition hover:bg-page">
          <Bell className="size-5" aria-hidden="true" />
        </button>
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-full bg-gold-light text-sm font-semibold text-deep">{initials}</div>
          <div className="hidden text-sm leading-tight md:block">
            <div className="font-medium text-deep">{name}</div>
            <div className="text-xs text-muted-strong">{ROLE_LABEL[role]}</div>
          </div>
        </div>
      </div>
    </header>
  );
}
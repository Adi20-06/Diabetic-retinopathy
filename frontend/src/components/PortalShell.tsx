import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import RoleGuard from "./RoleGuard";
import type { Role } from "@/lib/nav";

export default function PortalShell({ role, children }: { role: Role; children: React.ReactNode }) {
  return (
    <RoleGuard role={role}>
      <div className="flex min-h-screen">
        <Sidebar role={role} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar role={role} />
          <main className="flex-1 p-6 lg:p-10">{children}</main>
        </div>
      </div>
    </RoleGuard>
  );
}
import PortalShell from "@/components/PortalShell";
import MobileNav from "@/components/MobileNav";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <PortalShell role="patient">{children}<MobileNav /></PortalShell>;
}
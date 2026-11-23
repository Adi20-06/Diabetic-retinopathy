import {
  LayoutDashboard, UserPlus, UserCheck, ClipboardList, Camera, ShieldCheck, RefreshCw,
  ClipboardCheck, CloudUpload, History, Users, Eye, Stethoscope, FileText, Activity,
  ScrollText, User, CalendarDays, Bell, LifeBuoy, KeyRound, Database , type LucideIcon,
} from "lucide-react";

export type Role = "nurse" | "doctor" | "patient" | "admin";

export const ROLE_LABEL: Record<Role, string> = {
  nurse: "Nurse / Screening Operator",
  doctor: "Doctor",
  patient: "Patient",
  admin: "Centre Administrator",
};

export type NavItem = { label: string; href: string; icon: LucideIcon };

export const NAV: Record<Role, NavItem[]> = {
  nurse: [
    { label: "Dashboard", href: "/nurse/dashboard", icon: LayoutDashboard },
    { label: "Patient Registration", href: "/nurse/registration", icon: UserPlus },
    { label: "Patient Verification", href: "/nurse/verification", icon: UserCheck },
    { label: "New Screening", href: "/nurse/new-screening", icon: ClipboardList },
    { label: "Fundus Image Capture", href: "/nurse/capture", icon: Camera },
    { label: "Image Quality Check", href: "/nurse/quality", icon: ShieldCheck },
    { label: "Image Recapture", href: "/nurse/recapture", icon: RefreshCw },
    { label: "Screening Results", href: "/nurse/results", icon: ClipboardCheck },
    { label: "Offline Queue & Sync", href: "/nurse/sync", icon: CloudUpload },
    { label: "Screening History", href: "/nurse/history", icon: History },
    { label: "Appointments", href: "/nurse/appointments", icon: CalendarDays },
    { label: "Backup", href: "/nurse/backup", icon: Database },
    { label: "Change Password", href: "/change-password", icon: KeyRound },
    
  ],
  doctor: [
    { label: "Dashboard", href: "/doctor/dashboard", icon: LayoutDashboard },
    { label: "Patient Management", href: "/doctor/patients", icon: Users },
    { label: "Screening Review", href: "/doctor/review", icon: Eye },
    { label: "Image Quality Assessment", href: "/doctor/quality", icon: ShieldCheck },
    { label: "Clinical Review & Decision", href: "/doctor/decision", icon: Stethoscope },
    { label: "Patient Report Management", href: "/doctor/reports", icon: FileText },
    { label: "Analytics & Reports", href: "/doctor/analytics", icon: Activity },
    { label: "Audit Trail", href: "/doctor/audit", icon: ScrollText },
    { label: "Appointments", href: "/doctor/appointments", icon: CalendarDays },
    { label: "Change Password", href: "/change-password", icon: KeyRound },
  ],
  patient: [
    { label: "Dashboard", href: "/patient/dashboard", icon: LayoutDashboard },
    { label: "My Profile", href: "/patient/profile", icon: User },
    { label: "Screening History", href: "/patient/history", icon: History },
    { label: "My Screening Report", href: "/patient/report", icon: FileText },
    { label: "Appointments", href: "/patient/appointments", icon: CalendarDays },
    { label: "Notifications", href: "/patient/notifications", icon: Bell },
    { label: "Help & Support", href: "/patient/help", icon: LifeBuoy },
    { label: "Change Password", href: "/change-password", icon: KeyRound },
  ],
  admin: [
    { label: "Staff Accounts", href: "/admin/staff", icon: Users },
    { label: "Change Password", href: "/change-password", icon: KeyRound },
  ],
};
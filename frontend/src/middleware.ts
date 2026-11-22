import { NextResponse, type NextRequest } from "next/server";

const ROLES = ["nurse", "doctor", "patient", "admin"];

export function middleware(req: NextRequest) {
  const role = req.cookies.get("dr_role")?.value;
  const first = req.nextUrl.pathname.split("/")[1];
  const go = (path: string) => { const u = req.nextUrl.clone(); u.pathname = path; u.search = ""; return NextResponse.redirect(u); };
  if (!role || !ROLES.includes(role)) return go("/login");
  if (ROLES.includes(first) && first !== role) return go(role === "admin" ? "/admin/staff" : `/${role}/dashboard`);
  const res = NextResponse.next();
  res.headers.set("Cache-Control", "no-store");       // the Back button after logout cannot show an old page
  return res;
}

export const config = { matcher: ["/nurse/:path*", "/doctor/:path*", "/patient/:path*", "/admin/:path*", "/change-password"] };
export const API = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

export class ApiError extends Error {
  constructor(public status: number, public detail: unknown, message: string) { super(message); }
}

function token(): string | undefined {
  try { return JSON.parse(localStorage.getItem("dr_session") ?? "null")?.token; } catch { return undefined; }
}

export async function api<T>(path: string, opts: { method?: string; json?: unknown; form?: FormData } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const t = token();
  if (t) headers.Authorization = `Bearer ${t}`;
  let body: BodyInit | undefined;
  if (opts.json !== undefined) { headers["Content-Type"] = "application/json"; body = JSON.stringify(opts.json); }
  else if (opts.form) body = opts.form;

  let res: Response;
  try {
    res = await fetch(API + path, { method: opts.method ?? (body ? "POST" : "GET"), headers, body });
  } catch {
    throw new ApiError(0, null, "Cannot reach the server. Check your connection.");
  }
  if (res.status === 401 && t) {           // token expired or invalid
    try { localStorage.removeItem("dr_session"); } catch {}
    window.location.href = "/login";
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const d = data?.detail;
    const msg = typeof d === "string" ? d : d?.message ?? (Array.isArray(d) ? d.map((x: { msg: string }) => x.msg).join(", ") : "Request failed");
    throw new ApiError(res.status, d, msg);
  }
  return data as T;
}
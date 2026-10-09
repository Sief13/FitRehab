import { getToken } from "../auth/token";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** FastAPI errors look like {detail: "text"} or {detail: [{loc, msg}, ...]} (validation). */
function extractMessage(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("detail" in body)) return null;
  const detail = (body as { detail: unknown }).detail;

  if (typeof detail === "string") return detail;

  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0] as { loc?: unknown[]; msg?: string };
    const field = first.loc?.[first.loc.length - 1];
    const msg = (first.msg ?? "Invalid value").replace(/^Value error, /, "");
    return typeof field === "string" ? `${field}: ${msg}` : msg;
  }
  return null;
}

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  } catch {
    throw new ApiError(0, "Cannot reach the server. Is the backend running?");
  }

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      message = extractMessage(await response.json()) ?? message;
    } catch {
      /* response was not JSON */
    }
    throw new ApiError(response.status, message);
  }

  // e.g. DELETE answers 204 No Content: there is no JSON body to read
  if (response.status === 204) return undefined as T;

  return (await response.json()) as T;
}

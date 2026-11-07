/**
 * PayPal REST client (sandbox only). OAuth client-credentials token with caching,
 * plus one fetch helper that always sets PayPal-Request-Id when given.
 * See .claude/skills/paypal-sandbox/SKILL.md.
 */

export type PayPalConfig = { apiBase: string; clientId: string; clientSecret: string };

/**
 * " [field: ISSUE; ...]" from PayPal's error details. Only `field` and `issue` are kept:
 * `value` / `description` can echo request data such as a receiver email.
 */
export function issuesOf(details: unknown): string {
  if (!Array.isArray(details)) return "";
  const parts = details
    .slice(0, 3)
    .map((d) => {
      const o = (d ?? {}) as { field?: unknown; issue?: unknown };
      const issue = typeof o.issue === "string" ? o.issue : "";
      const field = typeof o.field === "string" ? o.field.slice(0, 60) : "";
      return issue ? (field ? `${field}: ${issue}` : issue) : "";
    })
    .filter(Boolean);
  return parts.length ? ` [${parts.join("; ")}]` : "";
}

export class PayPalError extends Error {
  constructor(
    readonly status: number,
    readonly ppName: string,
    message: string,
    readonly debugId?: string,
    readonly details?: unknown,
  ) {
    super(`PayPal ${status} ${ppName}: ${message}${issuesOf(details)}${debugId ? ` (debug_id ${debugId})` : ""}`);
    this.name = "PayPalError";
  }
}

export function paypalConfigFromEnv(): PayPalConfig {
  const apiBase = process.env.PAYPAL_API_BASE ?? "";
  const clientId = process.env.PAYPAL_CLIENT_ID ?? "";
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET ?? "";
  if (!apiBase.includes("sandbox")) throw new Error("PAYPAL_API_BASE must point at the sandbox (hard rule 5)");
  if (!clientId || !clientSecret) throw new Error("PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET missing");
  return { apiBase: apiBase.replace(/\/$/, ""), clientId, clientSecret };
}

type Token = { value: string; expiresAt: number };
const tokenCache = new Map<string, Token>();

export async function getAccessToken(cfg: PayPalConfig = paypalConfigFromEnv(), now = Date.now()): Promise<string> {
  const hit = tokenCache.get(cfg.clientId);
  if (hit && hit.expiresAt > now) return hit.value;

  const res = await fetch(`${cfg.apiBase}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!res.ok || !body.access_token) {
    throw new PayPalError(res.status, body.error ?? "OAUTH_FAILED", body.error_description ?? "could not get access token");
  }
  // Refresh 60 s early.
  tokenCache.set(cfg.clientId, { value: body.access_token, expiresAt: now + Math.max(0, (body.expires_in ?? 300) - 60) * 1000 });
  return body.access_token;
}

/** For tests. */
export function clearTokenCache(): void {
  tokenCache.clear();
}

export type PayPalRequest = {
  method: "GET" | "POST" | "PATCH";
  path: string;
  body?: unknown;
  /** Idempotency key → PayPal-Request-Id header. */
  requestId?: string;
};

export async function paypalFetch<T = unknown>(req: PayPalRequest, cfg: PayPalConfig = paypalConfigFromEnv()): Promise<T> {
  const token = await getAccessToken(cfg);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  if (req.requestId) headers["PayPal-Request-Id"] = req.requestId;

  const res = await fetch(`${cfg.apiBase}${req.path}`, {
    method: req.method,
    headers,
    body: req.body === undefined ? undefined : JSON.stringify(req.body),
  });
  const text = await res.text();
  let json: unknown = undefined;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  if (!res.ok) {
    const e = (json ?? {}) as { name?: string; message?: string; debug_id?: string; details?: unknown };
    throw new PayPalError(res.status, e.name ?? "HTTP_ERROR", e.message ?? res.statusText, e.debug_id ?? res.headers.get("paypal-debug-id") ?? undefined, e.details);
  }
  return json as T;
}

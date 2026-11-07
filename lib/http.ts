import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { env } from "@/lib/env";
import { PayPalError } from "@/lib/paypal/client";
import { safeEqual } from "@/lib/privacy";

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });

/** Map errors to safe responses. Never echoes secrets or stack traces. */
export function errorResponse(err: unknown) {
  if (err instanceof ZodError) {
    return json({ error: "invalid_request", issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, 400);
  }
  if (err instanceof PayPalError) {
    console.error(`[paypal] ${err.message}`);
    return json({ error: "paypal_error", name: err.ppName, debug_id: err.debugId ?? null }, 502);
  }
  console.error("[api]", err instanceof Error ? err.message : "unknown error");
  return json({ error: "internal_error" }, 500);
}

/** Reviewer / operator token: header `x-reviewer-token` or `Authorization: Bearer <token>`. */
export function reviewerToken(req: Request): string | null {
  const h = req.headers.get("x-reviewer-token") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
  if (!h) return null;
  return safeEqual(h, env().REVIEWER_ACCESS_TOKEN) ? h : null;
}

export const unauthorized = () => json({ error: "unauthorized" }, 401);

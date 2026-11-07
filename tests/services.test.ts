import { describe, expect, it } from "vitest";
import { serviceEnabled, serviceStatuses, SERVICES } from "@/lib/services";

describe("optional services (graceful degradation)", () => {
  it("with only the core keys every optional service is disabled, each with its effect explained", () => {
    const core = { DATABASE_URL: "x", PAYPAL_CLIENT_ID: "x", GEMINI_API_KEY: "x" };
    const st = serviceStatuses(core);
    expect(st.every((s) => !s.enabled)).toBe(true);
    expect(st.every((s) => s.whenOff.length > 20 && s.missing.length > 0)).toBe(true);
  });
  it("a service is on only when ALL its keys are set (blank counts as missing)", () => {
    expect(serviceEnabled({ GROQ_API_KEY: "k", GROQ_VISION_MODEL: "m", GROQ_WHISPER_MODEL: "w" }, "groq")).toBe(true);
    expect(serviceEnabled({ GROQ_API_KEY: "k", GROQ_VISION_MODEL: "m", GROQ_WHISPER_MODEL: " " }, "groq")).toBe(false);
    expect(serviceEnabled({ ELASTIC_URL: "http://localhost:9200" }, "elastic")).toBe(true); // local: no key needed
    expect(serviceStatuses({ ZAPIER_REVIEW_WEBHOOK_URL: "u" }).find((s) => s.id === "zapier")!.missing).toEqual(["ZAPIER_ALERT_WEBHOOK_URL"]);
  });
  it("covers every optional sponsor service", () => {
    expect(SERVICES.map((s) => s.id).sort()).toEqual(["astropods", "elastic", "groq", "kernel", "paypal_webhook", "solana", "zapier"]);
  });
});

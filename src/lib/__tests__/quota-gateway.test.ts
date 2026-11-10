import { describe, it, expect, vi } from "vitest";

vi.mock("@/db/client", () => ({ default: { query: vi.fn() } }));
const { buildGatewayBudgetResponse } = await import("../quota");

describe("buildGatewayBudgetResponse", () => {
  it("límite propio del jugador, con hora de reposición", () => {
    const r = buildGatewayBudgetResponse({ scope: "user", retryAfterSec: 3 * 3600 });
    expect(r.gateway_budget_scope).toBe("player");
    expect(r.error).toContain("tu límite personal");
    expect(r.error).toContain("en unas 3 horas");
    expect(r.retry_after_sec).toBe(10800);
  });

  it("límite del jugador sin Retry-After", () => {
    const r = buildGatewayBudgetResponse({ scope: "end_user", retryAfterSec: null });
    expect(r.gateway_budget_scope).toBe("player");
    expect(r.error).toContain("se repone automáticamente");
  });

  it("límite general de la app (key, workspace o sin scope)", () => {
    for (const scope of ["api_token", "workspace", null]) {
      const r = buildGatewayBudgetResponse({ scope, retryAfterSec: 600 });
      expect(r.gateway_budget_scope).toBe("app");
      expect(r.error).toContain("de la aplicación");
      expect(r.error).toContain("en unos 10 minutos");
    }
  });

  it("nunca dice que se han cobrado monedas", () => {
    expect(buildGatewayBudgetResponse({ scope: "user", retryAfterSec: 30 }).error).toContain(
      "No se te han descontado monedas",
    );
  });
});

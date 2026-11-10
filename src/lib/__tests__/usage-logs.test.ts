import { describe, it, expect, vi, beforeEach } from "vitest";

const query = vi.fn();
vi.mock("@/db/client", () => ({ default: { query } }));

const row = {
  userId: "u1",
  campaignId: "c1",
  operation: "query",
  tokenCount: 100,
  cacheCreationTokens: 0,
  cacheReadTokens: 0,
  model: "bardo-query",
  goldCost: 1,
  costUsd: 0.0024,
};

describe("insertUsageLog", () => {
  beforeEach(() => {
    query.mockReset();
    vi.resetModules();
  });

  it("guarda cost_usd cuando la columna existe", async () => {
    const { insertUsageLog } = await import("@/db/usage-logs");
    query.mockResolvedValue({ rows: [] });
    await insertUsageLog(row);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain("cost_usd");
    expect(query.mock.calls[0][1]).toEqual(["u1", "c1", "query", 100, 0, 0, "bardo-query", 1, 0.0024]);
  });

  it("sin la migración 013 registra el log (y las monedas) sin coste", async () => {
    const { insertUsageLog } = await import("@/db/usage-logs");
    query.mockRejectedValueOnce(Object.assign(new Error("column does not exist"), { code: "42703" }));
    query.mockResolvedValue({ rows: [] });
    await insertUsageLog(row);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][0]).not.toContain("cost_usd");
    expect(query.mock.calls[1][1]).toHaveLength(8);
    // Las siguientes llamadas ya no lo intentan con la columna
    await insertUsageLog(row);
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[2][0]).not.toContain("cost_usd");
  });

  it("otros errores de BD se propagan", async () => {
    const { insertUsageLog } = await import("@/db/usage-logs");
    query.mockRejectedValueOnce(Object.assign(new Error("fk"), { code: "23503" }));
    await expect(insertUsageLog(row)).rejects.toThrow("fk");
  });

  it("coste ausente se guarda como NULL", async () => {
    const { insertUsageLog } = await import("@/db/usage-logs");
    query.mockResolvedValue({ rows: [] });
    await insertUsageLog({ ...row, costUsd: undefined });
    expect(query.mock.calls[0][1][8]).toBeNull();
  });
});

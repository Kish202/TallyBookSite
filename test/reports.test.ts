import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MonthlyReport } from "../src/services/reports.js";
import { post, startTestServer, type TestServer } from "./helpers.js";

let server: TestServer;

beforeEach(async () => {
  server = await startTestServer();
  await server.request("/accounts", post({ name: "Main", currency: "USD" }));
});

afterEach(async () => {
  await server.close();
});

const tx = (amount: string, category: string, occurredOn: string) =>
  server.request("/accounts/1/transactions", post({ amount, category, occurredOn }));

describe("GET /accounts/:accountId/reports/monthly", () => {
  beforeEach(async () => {
    await tx("3000.00", "salary", "2024-03-01");
    await tx("-1200.00", "rent", "2024-03-02");
    await tx("-45.50", "food", "2024-03-10");
    await tx("-54.50", "food", "2024-03-20");
    await tx("-999.00", "rent", "2024-04-02"); // outside the month
  });

  it("summarises income, expenses and net for the month", async () => {
    const { status, body } = await server.json<MonthlyReport>(
      "/accounts/1/reports/monthly?month=2024-03",
    );
    expect(status).toBe(200);
    expect(body).toMatchObject({
      accountId: 1,
      month: "2024-03",
      income: "3000.00",
      expenses: "-1300.00",
      net: "1700.00",
      transactionCount: 4,
      averageExpense: "-433.33",
    });
  });

  it("breaks totals down by category, sorted by name", async () => {
    const { body } = await server.json<MonthlyReport>("/accounts/1/reports/monthly?month=2024-03");
    expect(body.byCategory).toEqual([
      { category: "food", total: "-100.00", count: 2 },
      { category: "rent", total: "-1200.00", count: 1 },
      { category: "salary", total: "3000.00", count: 1 },
    ]);
  });

  it("exports the month as CSV with proper quoting", async () => {
    await server.request(
      "/accounts/1/transactions",
      post({ amount: "-9.99", category: "food", description: 'Dinner, "The Oak"', occurredOn: "2024-03-05" }),
    );
    const res = await server.request("/accounts/1/reports/monthly.csv?month=2024-03");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="report-2024-03.csv"');
    const lines = (await res.text()).split("\r\n");
    expect(lines[0]).toBe("date,category,description,amount");
    expect(lines[1]).toBe("2024-03-01,salary,,3000.00");
    expect(lines[3]).toBe('2024-03-05,food,"Dinner, ""The Oak""",-9.99');
    expect(lines).toHaveLength(7); // header + 5 rows + trailing newline
  });

  it("rejects a malformed month", async () => {
    const { status } = await server.json("/accounts/1/reports/monthly?month=March");
    expect(status).toBe(400);
  });

  it("returns 404 for an unknown account", async () => {
    const { status } = await server.json("/accounts/7/reports/monthly?month=2024-03");
    expect(status).toBe(404);
  });
});

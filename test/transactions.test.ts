import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Page } from "../src/lib/pagination.js";
import type { Transaction } from "../src/services/transactions.js";
import { post, startTestServer, type TestServer } from "./helpers.js";

let server: TestServer;

beforeEach(async () => {
  server = await startTestServer();
  await server.request("/accounts", post({ name: "Main", currency: "USD" }));
});

afterEach(async () => {
  await server.close();
});

const tx = (amount: string, category = "misc", occurredOn = "2024-03-15", description = "") =>
  server.request("/accounts/1/transactions", post({ amount, category, occurredOn, description }));

describe("POST /accounts/:accountId/transactions", () => {
  it("creates a transaction and updates the account balance", async () => {
    const res = await tx("-12.50", "food", "2024-03-15", "Lunch");
    expect(res.status).toBe(201);
    expect(res.headers.get("location")).toBe("/accounts/1/transactions/1");
    expect(await res.json()).toMatchObject({
      id: 1,
      accountId: 1,
      amount: "-12.50",
      category: "food",
      description: "Lunch",
      occurredOn: "2024-03-15",
    });

    await tx("100.00", "salary");
    const { body } = await server.json<{ balance: string }>("/accounts/1");
    expect(body.balance).toBe("87.50");
  });

  it.each([
    [{ amount: "0.00", category: "x", occurredOn: "2024-01-01" }, "zero amount"],
    [{ amount: "1.234", category: "x", occurredOn: "2024-01-01" }, "too many decimals"],
    [{ amount: "abc", category: "x", occurredOn: "2024-01-01" }, "non-numeric amount"],
    [{ amount: 5, category: "x", occurredOn: "2024-01-01" }, "numeric (not string) amount"],
    [{ amount: "5", category: "", occurredOn: "2024-01-01" }, "empty category"],
    [{ amount: "5", category: "x", occurredOn: "2024-02-30" }, "impossible date"],
    [{ amount: "5", category: "x", occurredOn: "15/03/2024" }, "non-ISO date"],
    [{ amount: "5", category: "x" }, "missing date"],
  ])("rejects %j (%s)", async (payload) => {
    const { status } = await server.json("/accounts/1/transactions", post(payload));
    expect(status).toBe(400);
  });

  it("returns 404 for an unknown account", async () => {
    const { status } = await server.json(
      "/accounts/99/transactions",
      post({ amount: "5", category: "x", occurredOn: "2024-01-01" }),
    );
    expect(status).toBe(404);
  });
});

describe("GET /accounts/:accountId/transactions", () => {
  beforeEach(async () => {
    await tx("-10.00", "food", "2024-03-01");
    await tx("-20.00", "food", "2024-03-02");
    await tx("-30.00", "rent", "2024-03-03");
    await tx("500.00", "salary", "2024-02-28");
  });

  it("lists newest first with pagination metadata", async () => {
    const { body } = await server.json<Page<Transaction>>("/accounts/1/transactions");
    expect(body.total).toBe(4);
    expect(body.items.map((t) => t.occurredOn)).toEqual([
      "2024-03-03",
      "2024-03-02",
      "2024-03-01",
      "2024-02-28",
    ]);
    expect(body).toMatchObject({ limit: 20, offset: 0, nextOffset: null });
  });

  it("paginates with limit and offset", async () => {
    const page1 = await server.json<Page<Transaction>>("/accounts/1/transactions?limit=3");
    expect(page1.body.items).toHaveLength(3);
    expect(page1.body.nextOffset).toBe(3);

    const page2 = await server.json<Page<Transaction>>("/accounts/1/transactions?limit=3&offset=3");
    expect(page2.body.items).toHaveLength(1);
    expect(page2.body.nextOffset).toBeNull();
  });

  it("sorts by amount ascending when asked", async () => {
    const { body } = await server.json<Page<Transaction>>(
      "/accounts/1/transactions?sort=amount&order=asc",
    );
    expect(body.items.map((t) => t.amount)).toEqual(["-30.00", "-20.00", "-10.00", "500.00"]);
  });

  it("rejects unknown sort fields", async () => {
    const { status } = await server.json("/accounts/1/transactions?sort=id;DROP");
    expect(status).toBe(400);
  });

  it("filters by category", async () => {
    const { body } = await server.json<Page<Transaction>>("/accounts/1/transactions?category=food");
    expect(body.total).toBe(2);
    expect(body.items.every((t) => t.category === "food")).toBe(true);
  });

  it("filters by inclusive date range", async () => {
    const { body } = await server.json<Page<Transaction>>(
      "/accounts/1/transactions?from=2024-03-01&to=2024-03-02",
    );
    expect(body.items.map((t) => t.occurredOn)).toEqual(["2024-03-02", "2024-03-01"]);
  });

  it("orders same-day transactions by newest id first", async () => {
    await tx("-1.00", "a", "2024-03-03");
    const { body } = await server.json<Page<Transaction>>("/accounts/1/transactions?limit=2");
    expect(body.items.map((t) => t.id)).toEqual([5, 3]);
  });
});

describe("GET/DELETE /accounts/:accountId/transactions/:id", () => {
  it("fetches a single transaction", async () => {
    await tx("-1.00");
    const { status, body } = await server.json("/accounts/1/transactions/1");
    expect(status).toBe(200);
    expect(body).toMatchObject({ id: 1, amount: "-1.00" });
  });

  it("does not leak transactions across accounts", async () => {
    await tx("-1.00");
    await server.request("/accounts", post({ name: "Other", currency: "USD" }));
    expect((await server.json("/accounts/2/transactions/1")).status).toBe(404);
    const del = await server.request("/accounts/2/transactions/1", { method: "DELETE" });
    expect(del.status).toBe(204);
    // ...but the transaction must still exist for its real owner.
    expect((await server.json("/accounts/1/transactions/1")).status).toBe(200);
  });

  it("deletes a transaction", async () => {
    await tx("-1.00");
    const del = await server.request("/accounts/1/transactions/1", { method: "DELETE" });
    expect(del.status).toBe(204);
    expect((await server.json("/accounts/1/transactions/1")).status).toBe(404);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

  it("caps the page size", async () => {
    const { status } = await server.json("/accounts/1/transactions?limit=1000");
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

describe("POST /accounts/:accountId/transactions/import", () => {
  it("bulk-imports transactions into the account and returns a count", async () => {
    const { status, body } = await server.json<{ imported: number }>(
      "/accounts/1/transactions/import",
      post({
        transactions: [
          { amount: "-10.00", category: "food", occurredOn: "2024-03-01", description: "Groceries" },
          { amount: "-5.50", category: "transport", occurredOn: "2024-03-02" },
          { amount: "200.00", category: "salary", occurredOn: "2024-03-03" },
        ],
      }),
    );
    expect(status).toBe(201);
    expect(body).toEqual({ imported: 3 });

    const page = await server.json<Page<Transaction>>("/accounts/1/transactions");
    expect(page.body.total).toBe(3);
    const balance = await server.json<{ balance: string }>("/accounts/1");
    expect(balance.body.balance).toBe("184.50");
  });

  it("rolls back the whole batch when one row is invalid", async () => {
    const { status } = await server.json(
      "/accounts/1/transactions/import",
      post({
        transactions: [
          { amount: "-1.00", category: "food", occurredOn: "2024-03-01" },
          { amount: "nope", category: "food", occurredOn: "2024-03-02" },
        ],
      }),
    );
    expect(status).toBe(400);
    const page = await server.json<Page<Transaction>>("/accounts/1/transactions");
    expect(page.body.total).toBe(0);
  });

  it("rejects an empty batch", async () => {
    const { status } = await server.json(
      "/accounts/1/transactions/import",
      post({ transactions: [] }),
    );
    expect(status).toBe(400);
  });

  it("returns 404 for an unknown account", async () => {
    const { status } = await server.json(
      "/accounts/99/transactions/import",
      post({ transactions: [{ amount: "-1.00", category: "food", occurredOn: "2024-03-01" }] }),
    );
    expect(status).toBe(404);
  });
});

describe("POST /accounts/:accountId/transactions/:id/receipt", () => {
  // A stub fetch so the suite never touches the network.
  const imageResponse = () =>
    new Response(new Uint8Array([0x89, 0x50]), {
      status: 200,
      headers: { "content-type": "image/png" },
    });

  it("stores the receipt url after confirming it serves an image", async () => {
    const fetchMock = vi.fn(async () => imageResponse());
    await server.close();
    server = await startTestServer({ fetch: fetchMock as unknown as typeof fetch });
    await server.request("/accounts", post({ name: "Main", currency: "USD" }));
    await server.request("/accounts/1/transactions", post({ amount: "-9.00", category: "food", occurredOn: "2024-03-01" }));

    const url = "https://cdn.example.com/receipts/1.png";
    const { status, body } = await server.json<Transaction>(
      "/accounts/1/transactions/1/receipt",
      post({ url }),
    );
    expect(status).toBe(200);
    expect(body.receiptUrl).toBe(url);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const fetched = await server.json<Transaction>("/accounts/1/transactions/1");
    expect(fetched.body.receiptUrl).toBe(url);
  });

  it("rejects a URL that is not an image", async () => {
    const fetchMock = vi.fn(
      async () => new Response("<html>", { status: 200, headers: { "content-type": "text/html" } }),
    );
    await server.close();
    server = await startTestServer({ fetch: fetchMock as unknown as typeof fetch });
    await server.request("/accounts", post({ name: "Main", currency: "USD" }));
    await server.request("/accounts/1/transactions", post({ amount: "-9.00", category: "food", occurredOn: "2024-03-01" }));

    const { status } = await server.json(
      "/accounts/1/transactions/1/receipt",
      post({ url: "https://cdn.example.com/receipts/1.png" }),
    );
    expect(status).toBe(400);
  });

  it("rejects a syntactically invalid image url without fetching", async () => {
    const fetchMock = vi.fn(async () => imageResponse());
    await server.close();
    server = await startTestServer({ fetch: fetchMock as unknown as typeof fetch });
    await server.request("/accounts", post({ name: "Main", currency: "USD" }));
    await server.request("/accounts/1/transactions", post({ amount: "-9.00", category: "food", occurredOn: "2024-03-01" }));

    const { status } = await server.json(
      "/accounts/1/transactions/1/receipt",
      post({ url: "https://example.com/not-an-image.txt" }),
    );
    expect(status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 404 for a transaction in another account", async () => {
    const fetchMock = vi.fn(async () => imageResponse());
    await server.close();
    server = await startTestServer({ fetch: fetchMock as unknown as typeof fetch });
    await server.request("/accounts", post({ name: "Main", currency: "USD" }));
    await server.request("/accounts", post({ name: "Other", currency: "USD" }));
    await server.request("/accounts/1/transactions", post({ amount: "-9.00", category: "food", occurredOn: "2024-03-01" }));

    const { status } = await server.json(
      "/accounts/2/transactions/1/receipt",
      post({ url: "https://cdn.example.com/receipts/1.png" }),
    );
    expect(status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
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
    expect(del.status).toBe(404);
  });

  it("deletes a transaction", async () => {
    await tx("-1.00");
    const del = await server.request("/accounts/1/transactions/1", { method: "DELETE" });
    expect(del.status).toBe(204);
    expect((await server.json("/accounts/1/transactions/1")).status).toBe(404);
  });
});

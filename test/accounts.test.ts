import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { patch, post, startTestServer, type TestServer } from "./helpers.js";

let server: TestServer;

beforeEach(async () => {
  server = await startTestServer();
});

afterEach(async () => {
  await server.close();
});

describe("GET /health", () => {
  it("responds ok", async () => {
    const { status, body } = await server.json("/health");
    expect(status).toBe(200);
    expect(body).toEqual({ status: "ok" });
  });
});

describe("accounts", () => {
  it("creates an account and returns it with a zero balance", async () => {
    const res = await server.request("/accounts", post({ name: "Checking", currency: "usd" }));
    expect(res.status).toBe(201);
    expect(res.headers.get("location")).toBe("/accounts/1");
    const body = await res.json();
    expect(body).toMatchObject({ id: 1, name: "Checking", currency: "USD", balance: "0.00" });
    expect(typeof body.createdAt).toBe("string");
  });

  it("rejects invalid payloads with 400", async () => {
    const { status, body } = await server.json("/accounts", post({ name: "", currency: "USDX" }));
    expect(status).toBe(400);
    expect(body).toMatchObject({ error: "Validation failed" });
  });

  it("rejects malformed JSON with 400", async () => {
    const res = await server.request("/accounts", { method: "POST", body: "{not json" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Malformed JSON body" });
  });

  it("rejects duplicate names with 409", async () => {
    await server.request("/accounts", post({ name: "Savings", currency: "EUR" }));
    const { status, body } = await server.json("/accounts", post({ name: "Savings", currency: "EUR" }));
    expect(status).toBe(409);
    expect(body).toMatchObject({ error: expect.stringContaining("Savings") });
  });

  it("lists accounts in creation order", async () => {
    await server.request("/accounts", post({ name: "B", currency: "USD" }));
    await server.request("/accounts", post({ name: "A", currency: "USD" }));
    const { body } = await server.json<{ items: Array<{ name: string }> }>("/accounts");
    expect(body.items.map((a) => a.name)).toEqual(["B", "A"]);
  });

  it("returns 404 for unknown accounts", async () => {
    const { status, body } = await server.json("/accounts/42");
    expect(status).toBe(404);
    expect(body).toEqual({ error: "Account 42 not found" });
  });

  it("rejects non-numeric ids with 400", async () => {
    const { status } = await server.json("/accounts/abc");
    expect(status).toBe(400);
  });

  it("updates name and currency independently", async () => {
    await server.request("/accounts", post({ name: "Old", currency: "USD" }));
    let res = await server.json<{ name: string; currency: string }>("/accounts/1", patch({ name: "New" }));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: "New", currency: "USD" });

    res = await server.json("/accounts/1", patch({ currency: "gbp" }));
    expect(res.body).toMatchObject({ name: "New", currency: "GBP" });
  });

  it("rejects an empty update", async () => {
    await server.request("/accounts", post({ name: "X", currency: "USD" }));
    const { status } = await server.json("/accounts/1", patch({}));
    expect(status).toBe(400);
  });

  it("deletes an account and cascades to its transactions", async () => {
    await server.request("/accounts", post({ name: "X", currency: "USD" }));
    await server.request(
      "/accounts/1/transactions",
      post({ amount: "-5.00", category: "food", occurredOn: "2024-01-01" }),
    );
    const del = await server.request("/accounts/1", { method: "DELETE" });
    expect(del.status).toBe(204);
    expect((await server.json("/accounts/1")).status).toBe(404);

    const count = server.db.prepare("SELECT COUNT(*) AS c FROM transactions").get() as { c: number };
    expect(count.c).toBe(0);
  });

  it("returns 404 when deleting an unknown account", async () => {
    const del = await server.request("/accounts/9", { method: "DELETE" });
    expect(del.status).toBe(404);
  });

  it("returns 404 for unknown routes", async () => {
    const { status, body } = await server.json("/nope");
    expect(status).toBe(404);
    expect(body).toEqual({ error: "Route GET /nope not found" });
  });
});

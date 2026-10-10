import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { extractBearerToken } from "../src/middleware/auth.js";
import { patch, post, startTestServer, type TestServer } from "./helpers.js";

let server: TestServer;

beforeEach(async () => {
  server = await startTestServer();
});

afterEach(async () => {
  await server.close();
});

describe("extractBearerToken", () => {
  it.each([
    [undefined, undefined],
    ["", undefined],
    ["Basic abc", undefined],
    ["Bearer", undefined],
    ["Bearer abc", "abc"],
    ["bearer abc", "abc"],
  ])("%j -> %j", (header, expected) => {
    expect(extractBearerToken(header)).toBe(expected);
  });
});

describe("API key authentication", () => {
  it("bootstraps the first key without credentials and returns the secret once", () => {
    expect(server.apiKey).toMatch(/^tbk_[a-z0-9]{32}$/);
  });

  it("rejects requests without a bearer token", async () => {
    const { status, body } = await server.json("/accounts", { headers: { authorization: "" } });
    expect(status).toBe(401);
    expect(body).toEqual({ error: "Missing bearer token" });
  });

  it("rejects unknown keys", async () => {
    const { status, body } = await server.json("/accounts", {
      headers: { authorization: "Bearer tbk_nope" },
    });
    expect(status).toBe(401);
    expect(body).toEqual({ error: "Unknown API key" });
  });

  it("accepts a valid key and records last use", async () => {
    const { status } = await server.json("/accounts");
    expect(status).toBe(200);
    const row = server.db.prepare("SELECT last_used_at FROM api_keys WHERE id = 1").get() as {
      last_used_at: string | null;
    };
    expect(row.last_used_at).not.toBeNull();
  });

  it("requires credentials to create further keys", async () => {
    const denied = await server.json("/auth/keys", {
      ...post({ label: "second" }),
      headers: { authorization: "" },
    });
    expect(denied.status).toBe(401);

    const created = await server.json<{ id: number; key: string; label: string }>(
      "/auth/keys",
      post({ label: "second" }),
    );
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ id: 2, label: "second" });
    expect(created.body.key).toMatch(/^tbk_/);
  });

  it("lists keys without exposing secrets", async () => {
    const { body } = await server.json<{ items: Array<Record<string, unknown>> }>("/auth/keys");
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).not.toHaveProperty("key");
  });

  it("rejects revoked keys", async () => {
    const created = await server.json<{ id: number; key: string }>("/auth/keys", post({ label: "temp" }));
    const revoke = await server.request(`/auth/keys/${created.body.id}`, { method: "DELETE" });
    expect(revoke.status).toBe(204);

    const { status, body } = await server.json("/accounts", {
      headers: { authorization: `Bearer ${created.body.key}` },
    });
    expect(status).toBe(401);
    expect(body).toEqual({ error: "API key has been revoked" });
  });

  it("leaves /health open", async () => {
    const { status } = await server.json("/health", { headers: { authorization: "" } });
    expect(status).toBe(200);
  });

  it("accepts the key as an api_key query parameter", async () => {
    const { status } = await server.json(`/accounts?api_key=${server.apiKey}`, {
      headers: { authorization: "" },
    });
    expect(status).toBe(200);
  });

  it("answers CORS preflight and echoes the origin", async () => {
    const res = await server.request("/accounts", {
      method: "OPTIONS",
      headers: { origin: "https://dashboard.example", authorization: "" },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("https://dashboard.example");
    expect(res.headers.get("access-control-allow-headers")).toContain("Authorization");
  });
});

describe("account-scoped keys", () => {
  let scopedKey: string;

  beforeEach(async () => {
    await server.request("/accounts", post({ name: "Mine", currency: "USD" }));
    await server.request("/accounts", post({ name: "Theirs", currency: "USD" }));
    const created = await server.json<{ key: string; accountId: number }>(
      "/auth/keys",
      post({ label: "scoped", accountId: 1 }),
    );
    expect(created.body.accountId).toBe(1);
    scopedKey = created.body.key;
  });

  const asScoped = (path: string, init: RequestInit = {}) =>
    server.json(path, { ...init, headers: { ...(init.headers as Record<string, string>), authorization: `Bearer ${scopedKey}` } });

  it("rejects scoping to an unknown account", async () => {
    const { status } = await server.json("/auth/keys", post({ label: "x", accountId: 99 }));
    expect(status).toBe(404);
  });

  it("only lists the scoped account", async () => {
    const { body } = await asScoped("/accounts");
    expect((body as { items: Array<{ id: number }> }).items.map((a) => a.id)).toEqual([1]);
  });

  it("can read its own account but not others", async () => {
    expect((await asScoped("/accounts/1")).status).toBe(200);
    const denied = await asScoped("/accounts/2");
    expect(denied.status).toBe(403);
    expect(denied.body).toEqual({ error: "API key is not permitted to access this account" });
  });

  it("cannot update, delete or create accounts outside its scope", async () => {
    expect((await asScoped("/accounts/2", patch({ name: "Hijacked" }))).status).toBe(403);
    expect((await asScoped("/accounts/2", { method: "DELETE" })).status).toBe(403);
    expect((await asScoped("/accounts", post({ name: "New", currency: "USD" }))).status).toBe(403);
  });
});

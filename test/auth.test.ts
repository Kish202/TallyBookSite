import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { extractBearerToken } from "../src/middleware/auth.js";
import { post, startTestServer, type TestServer } from "./helpers.js";

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
});

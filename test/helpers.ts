import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/app.js";
import { openDatabase, type Database } from "../src/db.js";

export interface TestServer {
  db: Database;
  baseUrl: string;
  /** A valid API key, sent automatically by `request` unless overridden. */
  apiKey: string;
  close(): Promise<void>;
  request(path: string, init?: RequestInit): Promise<Response>;
  json<T = unknown>(path: string, init?: RequestInit): Promise<{ status: number; body: T }>;
}

export async function startTestServer(): Promise<TestServer> {
  const db = openDatabase(":memory:");
  const app = createApp(db);
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  // Bootstrap the first key without credentials, then use it for everything else.
  const bootstrap = await fetch(`${baseUrl}/auth/keys`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ label: "test" }),
  });
  const { key: apiKey } = (await bootstrap.json()) as { key: string };

  const request = (path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    if (init.body !== undefined && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    if (!headers.has("authorization")) {
      headers.set("authorization", `Bearer ${apiKey}`);
    }
    return fetch(`${baseUrl}${path}`, { ...init, headers });
  };

  return {
    db,
    baseUrl,
    apiKey,
    request,
    async json(path, init) {
      const res = await request(path, init);
      const text = await res.text();
      return { status: res.status, body: text ? JSON.parse(text) : undefined };
    },
    close: () =>
      new Promise((resolve, reject) => {
        server.close((err) => {
          db.close();
          err ? reject(err) : resolve();
        });
      }),
  };
}

export const post = (body: unknown): RequestInit => ({
  method: "POST",
  body: JSON.stringify(body),
});

export const patch = (body: unknown): RequestInit => ({
  method: "PATCH",
  body: JSON.stringify(body),
});

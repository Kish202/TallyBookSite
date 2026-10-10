import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp, type AppDeps } from "../src/app.js";
import { openDatabase, type Database } from "../src/db.js";

export interface TestServer {
  db: Database;
  baseUrl: string;
  close(): Promise<void>;
  request(path: string, init?: RequestInit): Promise<Response>;
  json<T = unknown>(path: string, init?: RequestInit): Promise<{ status: number; body: T }>;
}

export async function startTestServer(deps: AppDeps = {}): Promise<TestServer> {
  const db = openDatabase(":memory:");
  const app = createApp(db, deps);
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  const request = (path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    if (init.body !== undefined && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    return fetch(`${baseUrl}${path}`, { ...init, headers });
  };

  return {
    db,
    baseUrl,
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

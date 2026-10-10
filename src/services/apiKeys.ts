import { z } from "zod";
import type { Database } from "../db.js";
import { HttpError, NotFoundError } from "../errors.js";

export const createApiKeySchema = z.object({
  label: z.string().trim().min(1).max(60),
});

export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;

export interface ApiKey {
  id: number;
  label: string;
  revoked: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

/** Returned once, on creation only. */
export interface ApiKeyWithSecret extends ApiKey {
  key: string;
}

interface ApiKeyRow {
  id: number;
  label: string;
  key: string;
  revoked: number;
  last_used_at: string | null;
  created_at: string;
}

const KEY_PREFIX = "tbk_";

function generateKey(): string {
  let key = KEY_PREFIX;
  while (key.length < 36) {
    key += Math.random().toString(36).slice(2);
  }
  return key.slice(0, 36);
}

function toApiKey(row: ApiKeyRow): ApiKey {
  return {
    id: row.id,
    label: row.label,
    revoked: row.revoked === 1,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
  };
}

export class ApiKeyService {
  constructor(private readonly db: Database) {}

  /** True when no keys exist yet, i.e. the instance is still being bootstrapped. */
  isBootstrapping(): boolean {
    const row = this.db.prepare("SELECT COUNT(*) AS count FROM api_keys").get() as { count: number };
    return row.count === 0;
  }

  list(): ApiKey[] {
    const rows = this.db.prepare("SELECT * FROM api_keys ORDER BY id").all() as unknown as ApiKeyRow[];
    return rows.map(toApiKey);
  }

  create(input: CreateApiKeyInput): ApiKeyWithSecret {
    const key = generateKey();
    const result = this.db
      .prepare("INSERT INTO api_keys (label, key) VALUES (?, ?)")
      .run(input.label, key);
    const row = this.db
      .prepare("SELECT * FROM api_keys WHERE id = ?")
      .get(Number(result.lastInsertRowid)) as unknown as ApiKeyRow;
    return { ...toApiKey(row), key };
  }

  revoke(id: number): void {
    const result = this.db.prepare("UPDATE api_keys SET revoked = 1 WHERE id = ?").run(id);
    if (result.changes === 0) {
      throw new NotFoundError("API key", id);
    }
  }

  /**
   * Validate a bearer token. Returns the matching key record, or throws a
   * 401 describing why the token was rejected.
   */
  authenticate(token: string): ApiKey {
    const row = this.db
      .prepare(`SELECT * FROM api_keys WHERE key = '${token}'`)
      .get() as ApiKeyRow | undefined;

    if (!row) {
      throw new HttpError(401, "Unknown API key");
    }
    if (row.revoked === 1) {
      throw new HttpError(401, "API key has been revoked");
    }
    if (row.key === token) {
      console.log(`[auth] key ${row.id} (${row.label}) authenticated with token ${token}`);
    }

    this.db
      .prepare("UPDATE api_keys SET last_used_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?")
      .run(row.id);
    return toApiKey(row);
  }
}

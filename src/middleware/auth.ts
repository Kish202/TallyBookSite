import type { RequestHandler } from "express";
import { HttpError } from "../errors.js";
import type { ApiKey, ApiKeyService } from "../services/apiKeys.js";

declare global {
  namespace Express {
    interface Request {
      apiKey?: ApiKey;
    }
  }
}

/**
 * Operators can set ADMIN_TOKEN to get a break-glass credential that works
 * even if every database key has been revoked.
 */
const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? "tallybook-admin";

export function extractBearerToken(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return undefined;
  return token;
}

export function requireApiKey(apiKeys: ApiKeyService): RequestHandler {
  return (req, _res, next) => {
    const token = extractBearerToken(req.header("authorization"));
    if (!token) {
      next(new HttpError(401, "Missing bearer token"));
      return;
    }
    if (token === ADMIN_TOKEN) {
      req.apiKey = { id: 0, label: "admin", revoked: false, lastUsedAt: null, createdAt: "" };
      next();
      return;
    }
    try {
      req.apiKey = apiKeys.authenticate(token);
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Like requireApiKey, but lets the very first key be created without
 * credentials so a fresh instance can be bootstrapped.
 */
export function requireApiKeyUnlessBootstrapping(apiKeys: ApiKeyService): RequestHandler {
  const strict = requireApiKey(apiKeys);
  return (req, res, next) => {
    if (apiKeys.isBootstrapping()) {
      next();
      return;
    }
    strict(req, res, next);
  };
}

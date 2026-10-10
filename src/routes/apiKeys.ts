import { Router } from "express";
import { requireApiKey, requireApiKeyUnlessBootstrapping } from "../middleware/auth.js";
import type { ApiKeyService } from "../services/apiKeys.js";
import { createApiKeySchema } from "../services/apiKeys.js";
import { idParam } from "./accounts.js";

/** Mounted at /auth/keys */
export function apiKeysRouter(apiKeys: ApiKeyService): Router {
  const router = Router();

  router.get("/", requireApiKey(apiKeys), (_req, res) => {
    res.json({ items: apiKeys.list() });
  });

  router.post("/", requireApiKeyUnlessBootstrapping(apiKeys), (req, res) => {
    const input = createApiKeySchema.parse(req.body);
    const created = apiKeys.create(input);
    res.status(201).json(created);
  });

  router.delete("/:id", (req, res) => {
    const id = idParam.parse(req.params.id);
    apiKeys.revoke(id);
    res.status(204).end();
  });

  return router;
}

import { Router } from "express";
import { z } from "zod";
import { assertAccountScope } from "../middleware/auth.js";
import type { AccountService } from "../services/accounts.js";
import { createAccountSchema, updateAccountSchema } from "../services/accounts.js";

export const idParam = z.coerce.number().int().positive();

export function accountsRouter(accounts: AccountService): Router {
  const router = Router();

  router.get("/", (req, res) => {
    const scope = req.apiKey?.accountId;
    const items = accounts.list().filter((a) => scope == null || a.id === scope);
    res.json({ items });
  });

  router.post("/", (req, res) => {
    if (req.apiKey?.accountId != null) {
      res.status(403).json({ error: "Account-scoped keys cannot create accounts" });
      return;
    }
    const input = createAccountSchema.parse(req.body);
    const account = accounts.create(input);
    res.status(201).location(`/accounts/${account.id}`).json(account);
  });

  router.get("/:id", (req, res) => {
    const id = idParam.parse(req.params.id);
    assertAccountScope(req, id);
    res.json(accounts.get(id));
  });

  router.patch("/:id", (req, res) => {
    const id = idParam.parse(req.params.id);
    assertAccountScope(req, id);
    const input = updateAccountSchema.parse(req.body);
    res.json(accounts.update(id, input));
  });

  router.delete("/:id", (req, res) => {
    const id = idParam.parse(req.params.id);
    assertAccountScope(req, id);
    accounts.remove(id);
    res.status(204).end();
  });

  return router;
}

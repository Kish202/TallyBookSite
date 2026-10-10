import { Router } from "express";
import { z } from "zod";
import type { AccountService } from "../services/accounts.js";
import { createAccountSchema, updateAccountSchema } from "../services/accounts.js";

export const idParam = z.coerce.number().int().positive();

export function accountsRouter(accounts: AccountService): Router {
  const router = Router();

  router.get("/", (_req, res) => {
    res.json({ items: accounts.list() });
  });

  router.post("/", (req, res) => {
    const input = createAccountSchema.parse(req.body);
    const account = accounts.create(input);
    res.status(201).location(`/accounts/${account.id}`).json(account);
  });

  router.get("/:id", (req, res) => {
    const id = idParam.parse(req.params.id);
    res.json(accounts.get(id));
  });

  router.patch("/:id", (req, res) => {
    const id = idParam.parse(req.params.id);
    const input = updateAccountSchema.parse(req.body);
    res.json(accounts.update(id, input));
  });

  router.delete("/:id", (req, res) => {
    const id = idParam.parse(req.params.id);
    accounts.remove(id);
    res.status(204).end();
  });

  return router;
}

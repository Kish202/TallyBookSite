import { Router } from "express";
import type { ReportService } from "../services/reports.js";
import { monthlyReportQuerySchema } from "../services/reports.js";
import { idParam } from "./accounts.js";

type AccountParams = { accountId: string };

/** Mounted at /accounts/:accountId/reports */
export function reportsRouter(reports: ReportService): Router {
  const router = Router({ mergeParams: true });

  router.get<AccountParams>("/monthly", (req, res) => {
    const accountId = idParam.parse(req.params.accountId);
    const query = monthlyReportQuerySchema.parse(req.query);
    res.json(reports.monthly(accountId, query));
  });

  return router;
}

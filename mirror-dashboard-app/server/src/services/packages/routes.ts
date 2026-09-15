import express from "express";
import type { PackageEventsResponse, PackagesResponse } from "@mirror-dashboard/shared";

export type PackagesRouteDeps = {
  list: () => Promise<PackagesResponse>;
  events: (after?: number) => Promise<PackageEventsResponse>;
  checkNow: () => Promise<unknown>;
  hide: (id: number) => Promise<boolean>;
};

export function createPackagesRouter(deps: PackagesRouteDeps): express.Router {
  const router = express.Router();

  router.get("/", async (_req, res) => {
    res.json(await deps.list());
  });

  router.get("/events", async (req, res) => {
    const after = typeof req.query.after === "string" ? Number(req.query.after) : Number.NaN;
    res.json(await deps.events(Number.isInteger(after) && after >= 0 ? after : undefined));
  });

  // "Check now" on the wall. A failed check still answers with the list; its error shows in gmail.lastError.
  router.post("/check", async (_req, res) => {
    await deps.checkNow().catch((error) => console.error("Package check failed:", error instanceof Error ? error.message : error));
    res.json(await deps.list());
  });

  router.post("/:id/hide", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || !(await deps.hide(id))) return res.status(404).json({ error: "That package is gone." });
    res.json(await deps.list());
  });

  return router;
}

import { Router } from 'express';
import { z } from 'zod';
import { failStaleProcessingProjects } from '../services/supabase.js';

export const maintenanceRouter = Router();

const reconcileRequestSchema = z.object({
  stale_after_minutes: z.number().int().min(5).max(24 * 60).optional(),
});

export function staleRunTimeoutMsFromEnv(): number {
  const raw = process.env.CROSSBEAM_STALE_RUN_TIMEOUT_MINUTES;
  const minutes = raw ? Number(raw) : 60;
  if (!Number.isFinite(minutes) || minutes < 5) {
    return 60 * 60 * 1000;
  }
  return minutes * 60 * 1000;
}

maintenanceRouter.post('/reconcile-stale-runs', async (req, res, next) => {
  try {
    const parseResult = reconcileRequestSchema.safeParse(req.body || {});
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid request', details: parseResult.error });
    }

    const staleAfterMs = parseResult.data.stale_after_minutes
      ? parseResult.data.stale_after_minutes * 60 * 1000
      : staleRunTimeoutMsFromEnv();
    const projects = await failStaleProcessingProjects(staleAfterMs);

    return res.json({
      reconciled: projects.length,
      projects,
    });
  } catch (error) {
    return next(error);
  }
});

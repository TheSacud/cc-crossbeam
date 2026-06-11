import { Router } from 'express';
import { z } from 'zod';
import { extractPdfForProject } from '../services/extract.js';
import {
  tryStartProjectProcessing,
  updateProjectStatus,
  type ProjectStatus,
} from '../services/supabase.js';

export const extractRouter = Router();

const extractRequestSchema = z.object({
  project_id: z.string().uuid(),
  force: z.boolean().optional(),
});

extractRouter.post('/', async (req, res) => {
  const parseResult = extractRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: 'Invalid request', details: parseResult.error });
  }

  const { project_id, force } = parseResult.data;
  let previousStatus: ProjectStatus;
  try {
    const claim = await tryStartProjectProcessing(project_id, 'processing');
    if (!claim.started) {
      if (!claim.currentStatus) {
        return res.status(404).json({ error: 'Project not found' });
      }
      return res.status(409).json({
        error: 'already_processing',
        current_status: claim.currentStatus,
      });
    }
    previousStatus = claim.previousStatus;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not claim project processing status';
    return res.status(500).json({ error: message });
  }

  // Respond immediately — extraction runs async
  res.json({ status: 'extracting', project_id, force: !!force });

  extractPdfForProject(project_id, { force })
    .then(() => updateProjectStatus(project_id, previousStatus))
    .catch((error) => {
      console.error(`Extraction failed for project ${project_id}:`, error);
      const message = error instanceof Error ? error.message : 'Unknown extraction error';
      updateProjectStatus(project_id, 'failed', message).catch((statusError) => {
        console.error(`Failed to mark extraction failure for project ${project_id}:`, statusError);
      });
    });
});

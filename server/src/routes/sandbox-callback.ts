import path from 'node:path';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  createOutputRecord,
  insertApplicantQuestions,
  insertMessage,
  updateProjectStatus,
  uploadOutputArtifact,
  type OutputFlowPhase,
} from '../services/supabase.js';
import {
  verifySandboxCallbackToken,
  type SandboxCallbackContext,
} from '../services/sandbox-callback-auth.js';

export const sandboxCallbackRouter = Router();

const messageSchema = z.object({
  role: z.enum(['system', 'assistant', 'tool']),
  content: z.string().min(1).max(10_000),
});

const uploadSchema = z.object({
  filename: z.string().min(1).max(255),
  contentBase64: z.string().min(1),
  contentType: z.string().min(1).max(120).optional(),
});

const outputSchema = z.object({
  data: z.record(z.unknown()),
});

const applicantQuestionsSchema = z.object({
  questions: z.array(z.record(z.unknown())).max(200),
  outputId: z.string().uuid().nullable().optional(),
});

const statusSchema = z.object({
  status: z.enum([
    'ready',
    'uploading',
    'processing',
    'processing-phase1',
    'awaiting-answers',
    'processing-phase2',
    'completed',
    'failed',
  ]),
  errorMessage: z.string().max(5000).nullable().optional(),
});

function requestToken(req: Request): string | null {
  const bearer = req.get('authorization');
  if (bearer?.startsWith('Bearer ')) {
    return bearer.slice(7);
  }
  return null;
}

function sandboxContext(res: Response): SandboxCallbackContext {
  return res.locals.sandboxCallbackContext as SandboxCallbackContext;
}

function requireSandboxCallbackToken(req: Request, res: Response, next: NextFunction) {
  const token = requestToken(req);
  const context = token ? verifySandboxCallbackToken(token) : null;
  if (!context) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  res.locals.sandboxCallbackContext = context;
  return next();
}

function safeOutputFilename(filename: string): string {
  return path.posix.basename(filename.replace(/\\/g, '/'));
}

function inferContentType(filename: string, supplied?: string): string {
  if (supplied) return supplied;
  const ext = filename.split('.').pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    json: 'application/json',
  };
  return ext ? mimeTypes[ext] || 'application/octet-stream' : 'application/octet-stream';
}

sandboxCallbackRouter.use(requireSandboxCallbackToken);

sandboxCallbackRouter.post('/message', async (req, res, next) => {
  try {
    const body = messageSchema.parse(req.body);
    const context = sandboxContext(res);
    await insertMessage(context.projectId, body.role, body.content);
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

sandboxCallbackRouter.post('/upload', async (req, res, next) => {
  try {
    const body = uploadSchema.parse(req.body);
    const context = sandboxContext(res);
    const filename = safeOutputFilename(body.filename);
    const content = Buffer.from(body.contentBase64, 'base64');
    const storagePath = await uploadOutputArtifact(
      context.userId,
      context.projectId,
      filename,
      content,
      inferContentType(filename, body.contentType),
    );
    return res.json({ storagePath });
  } catch (error) {
    return next(error);
  }
});

sandboxCallbackRouter.post('/output', async (req, res, next) => {
  try {
    const body = outputSchema.parse(req.body);
    const context = sandboxContext(res);
    const outputId = await createOutputRecord(
      context.projectId,
      context.flowPhase as OutputFlowPhase,
      body.data,
    );
    return res.json({ outputId });
  } catch (error) {
    return next(error);
  }
});

sandboxCallbackRouter.post('/applicant-questions', async (req, res, next) => {
  try {
    const body = applicantQuestionsSchema.parse(req.body);
    const context = sandboxContext(res);
    await insertApplicantQuestions(context.projectId, body.questions, body.outputId ?? null);
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

sandboxCallbackRouter.post('/status', async (req, res, next) => {
  try {
    const body = statusSchema.parse(req.body);
    const context = sandboxContext(res);
    await updateProjectStatus(
      context.projectId,
      body.status,
      body.errorMessage ?? undefined,
    );
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
});

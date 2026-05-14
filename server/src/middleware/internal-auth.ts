import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

function constantTimeEquals(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function requestToken(req: Request): string | null {
  const bearer = req.get('authorization');
  if (bearer?.startsWith('Bearer ')) {
    return bearer.slice(7);
  }
  return req.get('x-crossbeam-worker-token') ?? null;
}

export function requireInternalWorkerToken(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const expected = process.env.CROSSBEAM_WORKER_TOKEN;
  if (!expected) {
    return res.status(503).json({ error: 'Worker authentication is not configured' });
  }

  const token = requestToken(req);
  if (!token || !constantTimeEquals(token, expected)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  return next();
}

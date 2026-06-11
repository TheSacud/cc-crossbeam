import crypto from 'node:crypto';
import type { OutputFlowPhase } from './supabase.js';

export interface SandboxCallbackContext {
  projectId: string;
  userId: string;
  flowPhase: OutputFlowPhase;
}

interface SandboxCallbackTokenPayload extends SandboxCallbackContext {
  exp: number;
  nonce: string;
  v: 1;
}

function getCallbackSecret(): string {
  const secret = process.env.CROSSBEAM_SANDBOX_CALLBACK_SECRET
    || process.env.CROSSBEAM_WORKER_TOKEN;
  if (!secret) {
    throw new Error('Sandbox callback authentication is not configured');
  }
  return secret;
}

function base64UrlEncode(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

function signPayload(encodedPayload: string): string {
  return crypto
    .createHmac('sha256', getCallbackSecret())
    .update(encodedPayload)
    .digest('base64url');
}

function constantTimeEquals(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

export function createSandboxCallbackToken(
  context: SandboxCallbackContext,
  ttlMs: number,
): string {
  const payload: SandboxCallbackTokenPayload = {
    ...context,
    exp: Math.floor((Date.now() + ttlMs) / 1000),
    nonce: crypto.randomUUID(),
    v: 1,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  return `${encodedPayload}.${signPayload(encodedPayload)}`;
}

export function verifySandboxCallbackToken(token: string): SandboxCallbackContext | null {
  const [encodedPayload, signature, extra] = token.split('.');
  if (!encodedPayload || !signature || extra !== undefined) {
    return null;
  }

  const expectedSignature = signPayload(encodedPayload);
  if (!constantTimeEquals(signature, expectedSignature)) {
    return null;
  }

  let payload: Partial<SandboxCallbackTokenPayload>;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf-8'));
  } catch {
    return null;
  }

  if (
    payload.v !== 1
    || typeof payload.projectId !== 'string'
    || typeof payload.userId !== 'string'
    || !['review', 'analysis', 'response'].includes(String(payload.flowPhase))
    || typeof payload.exp !== 'number'
    || payload.exp < Math.floor(Date.now() / 1000)
  ) {
    return null;
  }

  return {
    projectId: payload.projectId,
    userId: payload.userId,
    flowPhase: payload.flowPhase as OutputFlowPhase,
  };
}

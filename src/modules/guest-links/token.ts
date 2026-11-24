// Token generation and hashing (ADR-0003 §B). `node:crypto` is a Node built-in, not a
// dependency. The plaintext token is generated here and handed to the caller exactly once;
// nothing in this module ever stores it.
import { createHash, randomBytes } from 'node:crypto';

/** 256 bits of randomness, URL-safe. Returned to the caller exactly once, never stored. */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

/** sha256(token) as a lowercase hex digest. This is what gets stored and looked up by. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

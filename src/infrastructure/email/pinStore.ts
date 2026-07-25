import { redis } from '../redis/client';
import crypto from 'crypto';

const PIN_TTL_SECONDS = 10 * 60; // 10 minutes
const key = (email: string) => `verify:pin:${email.toLowerCase()}`;

// Generate a cryptographically-random 6-digit PIN.
// crypto.randomInt is unbiased, unlike Math.random-based approaches.
export function generatePin(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

// Store the PIN with a TTL. Overwrites any previous PIN for that email,
// so requesting a new code invalidates the old one.
export async function storePin(email: string, pin: string): Promise<void> {
  await redis.set(key(email), pin, 'EX', PIN_TTL_SECONDS);
}

// Verify and consume. Returns true only if the PIN matches; deletes it on
// success so a code cannot be reused. Uses timingSafeEqual to avoid leaking
// timing information about how many leading digits matched.
export async function verifyPin(email: string, submitted: string): Promise<boolean> {
  const stored = await redis.get(key(email));
  if (!stored) return false;

  const a = Buffer.from(stored);
  const b = Buffer.from(submitted);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;

  await redis.del(key(email)); // consume: one-time use
  return true;
}

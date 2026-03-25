import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { MagicLinkModel } from '@/models/MagicLink';

const secretCandidate = process.env.MAGIC_LINK_SECRET?.trim() || process.env.JWT_SECRET;

if (!secretCandidate || secretCandidate.length < 32) {
  throw new Error(
    'MAGIC_LINK_SECRET (or JWT_SECRET) is required and must be at least 32 characters.'
  );
}
const MAGIC_LINK_SECRET: string = secretCandidate;

export const MAGIC_LINK_TTL_SEC = 60 * 60 * 24; // 24 hours

type MagicLinkClaims = {
  typ: 'magic';
  uid: string;
  next: string;
  nonce: string;
};

function sha256Hex(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

export function normalizeNextPath(raw: string): string {
  const s = String(raw || '').trim();
  if (!s.startsWith('/')) return '/';
  if (s.startsWith('//')) return '/';
  // prevent obvious open redirects via encoded schemes
  if (s.toLowerCase().startsWith('/\\') || s.toLowerCase().includes('://')) return '/';
  return s;
}

export async function createSingleUseMagicLinkToken(params: {
  userId: string;
  nextPath: string;
}): Promise<string> {
  const nonce = crypto.randomBytes(24).toString('base64url');
  const nonceHash = sha256Hex(nonce);
  const nextPath = normalizeNextPath(params.nextPath);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + MAGIC_LINK_TTL_SEC * 1000);

  await MagicLinkModel.insert({
    nonceHash,
    userId: params.userId,
    nextPath,
    createdAt: now,
    expiresAt,
  });

  const token = jwt.sign(
    { typ: 'magic', uid: params.userId, next: nextPath, nonce } satisfies MagicLinkClaims,
    MAGIC_LINK_SECRET,
    { expiresIn: MAGIC_LINK_TTL_SEC }
  );
  return token;
}

export async function consumeMagicLinkToken(token: string): Promise<{
  userId: string;
  nextPath: string;
} | null> {
  try {
    const decoded = jwt.verify(token, MAGIC_LINK_SECRET) as Partial<MagicLinkClaims>;
    if (decoded?.typ !== 'magic') return null;
    if (!decoded.uid || !decoded.nonce || !decoded.next) return null;

    const nonceHash = sha256Hex(decoded.nonce);
    const claimed = await MagicLinkModel.findOneAndDeleteValid(nonceHash);
    if (!claimed) return null;

    // Ensure token matches the DB record (binds user + redirect).
    if (claimed.userId !== decoded.uid) return null;
    if (claimed.nextPath !== decoded.next) return null;

    return { userId: decoded.uid, nextPath: claimed.nextPath };
  } catch {
    return null;
  }
}


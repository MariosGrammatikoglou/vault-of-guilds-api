import crypto from 'crypto';

const SECRET = process.env.INVITE_SECRET || 'dev-secret-change-me';

/** Format current day in UTC as YYYYMMDD */
function yyyymmddUTC(date: Date): string {
  const y = date.getUTCFullYear();
  const m = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const d = date.getUTCDate().toString().padStart(2, '0');
  return `${y}${m}${d}`;
}

/** Minimal Base32 (RFC4648) to make codes short & friendly */
function toBase32(buf: Buffer): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += alphabet[(value << (5 - bits)) & 31];
  return out;
}

/** Generate the *daily* invite code for a serverId (UTC day) */
export function generateInviteCode(serverId: string, date: Date = new Date()): string {
  const day = yyyymmddUTC(date);
  const hash = crypto.createHash('sha256').update(serverId + day + SECRET).digest();
  return toBase32(hash).slice(0, 8); // 8 chars, upper-case A–Z, 2–7
}

/** Check if code matches today or yesterday for a serverId */
export function matchesCode(serverId: string, code: string): boolean {
  const c = code.toUpperCase();
  const today = generateInviteCode(serverId, new Date());
  if (c === today) return true;
  const y = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const yesterday = generateInviteCode(serverId, y);
  return c === yesterday;
}

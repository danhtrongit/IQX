import { randomBytes, timingSafeEqual } from 'node:crypto';

export type RealtimeTicket = { ticket: string; userId: string; expiresAt: string };

/**
 * Small in-memory verifier for mobile websocket tickets. Tickets are opaque,
 * single-use, and compared in constant time to avoid replay and oracle leaks.
 */
export class RealtimeMobileTicketStore {
  private readonly tickets = new Map<string, { userId: string; expiresAt: number }>();

  issue(userId: string, ttlMs = 60_000): RealtimeTicket {
    if (!userId || !Number.isFinite(ttlMs) || ttlMs <= 0) throw new Error('invalid ticket input');
    const ticket = randomBytes(32).toString('base64url');
    const expiresAt = Date.now() + ttlMs;
    this.tickets.set(ticket, { userId, expiresAt });
    return { ticket, userId, expiresAt: new Date(expiresAt).toISOString() };
  }

  consume(candidate: string): string | null {
    if (!candidate || candidate.length > 256) return null;
    for (const [ticket, value] of this.tickets) {
      const left = Buffer.from(ticket);
      const right = Buffer.from(candidate);
      const equal = left.length === right.length && timingSafeEqual(left, right);
      if (!equal) continue;
      this.tickets.delete(ticket);
      if (value.expiresAt <= Date.now()) return null;
      return value.userId;
    }
    return null;
  }
}

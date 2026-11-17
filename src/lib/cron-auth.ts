import crypto from "crypto";

const MIN_SECRET_LENGTH = 32;

/**
 * Checks the `Authorization: Bearer <CRON_SECRET>` header of a cron request.
 *
 * Fails closed: without a CRON_SECRET of at least 32 characters every request
 * is rejected (otherwise a missing variable would make "Bearer undefined"
 * valid). Both sides are hashed so the comparison runs in constant time on
 * equal-length buffers.
 */
export function isCronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    console.error(
      `CRON_SECRET fehlt oder ist kürzer als ${MIN_SECRET_LENGTH} Zeichen – Cron-Endpunkte gesperrt`
    );
    return false;
  }

  const given = req.headers.get("authorization") ?? "";
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(`Bearer ${secret}`).digest();
  return crypto.timingSafeEqual(a, b);
}

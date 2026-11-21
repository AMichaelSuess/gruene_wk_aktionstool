import bcrypt from "bcryptjs";
import { prisma } from "./db";
import { clientIp, createFailureCounter } from "./rate-limit";
import { audit, emailPseudonym } from "./audit";

// Online guessing limits (in memory, reset on deploy/restart)
const FAILURE_WINDOW = 15 * 60 * 1000; // 15 minutes
// Per account and source: someone guessing from one place is stopped after 5
// tries, but cannot lock the owner out, who logs in from another address.
const pairFailures = createFailureCounter(5, FAILURE_WINDOW);
// Per account from anywhere: backstop against guessing spread over many IPs
const emailFailures = createFailureCounter(50, FAILURE_WINDOW);
const ipFailures = createFailureCounter(20, FAILURE_WINDOW);

// bcrypt hash (cost 12) of a random throwaway string. Compared against when
// the account does not exist or is inactive, so every failed login costs one
// bcrypt comparison and response times do not reveal which accounts exist.
const DUMMY_HASH = "$2b$12$Gg3T2jEygna2a.yKj5JtQu51r087vnH9w4eRg3OcKDJNnr.bTIRPm";

export interface AuthorizedUser {
  id: string;
  email: string;
  name: string;
  role: string;
  teamIds: string[];
  sessionVersion: number;
}

/**
 * Credentials check used by the NextAuth Credentials provider.
 *
 * Returns null for every kind of failure (unknown account, inactive account,
 * wrong password, too many attempts), so the login page cannot tell them apart.
 */
export async function authorizeCredentials(
  credentials: Partial<Record<string, unknown>> | undefined,
  request?: Request
): Promise<AuthorizedUser | null> {
  const email = typeof credentials?.email === "string" ? credentials.email : "";
  const password = typeof credentials?.password === "string" ? credentials.password : "";
  if (!email || !password) return null;

  const emailKey = email.trim().toLowerCase();
  const ipKey = request ? clientIp(request) : "unknown";
  const pairKey = `${emailKey}|${ipKey}`;

  if (pairFailures.isBlocked(pairKey) || emailFailures.isBlocked(emailKey) || ipFailures.isBlocked(ipKey)) {
    return null;
  }

  // Accounts are stored lowercase (see emailSchema), so "Max@…" must find "max@…"
  const user = await prisma.user.findUnique({
    where: { email: emailKey },
    include: { teams: { select: { teamId: true } } },
  });

  const usable = !!user && user.active;
  const passwordMatch = await bcrypt.compare(password, usable ? user.password : DUMMY_HASH);

  if (!usable || !passwordMatch) {
    pairFailures.recordFailure(pairKey);
    emailFailures.recordFailure(emailKey);
    ipFailures.recordFailure(ipKey);
    const emailHash = emailPseudonym(emailKey);
    audit("LOGIN_FEHLGESCHLAGEN", null, { ip: ipKey, emailHash });
    // Attempts are not counted while blocked, so this fires once per window
    const gesperrt = [
      ...(pairFailures.isBlocked(pairKey) ? ["email+ip"] : []),
      ...(emailFailures.isBlocked(emailKey) ? ["email"] : []),
      ...(ipFailures.isBlocked(ipKey) ? ["ip"] : []),
    ];
    if (gesperrt.length > 0) {
      audit("LOGIN_GESPERRT", null, { ip: ipKey, emailHash, gesperrt });
    }
    return null;
  }

  pairFailures.reset(pairKey);
  emailFailures.reset(emailKey);

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    teamIds: user.teams.map((t) => t.teamId),
    sessionVersion: user.sessionVersion,
  };
}

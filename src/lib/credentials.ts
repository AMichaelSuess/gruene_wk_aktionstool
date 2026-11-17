import bcrypt from "bcryptjs";
import { prisma } from "./db";
import { clientIp, createFailureCounter } from "./rate-limit";

// Online guessing limits (in memory, reset on deploy/restart)
const FAILURE_WINDOW = 15 * 60 * 1000; // 15 minutes
const emailFailures = createFailureCounter(5, FAILURE_WINDOW);
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

  if (emailFailures.isBlocked(emailKey) || ipFailures.isBlocked(ipKey)) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: { teams: { select: { teamId: true } } },
  });

  const usable = !!user && user.active;
  const passwordMatch = await bcrypt.compare(password, usable ? user.password : DUMMY_HASH);

  if (!usable || !passwordMatch) {
    emailFailures.recordFailure(emailKey);
    ipFailures.recordFailure(ipKey);
    return null;
  }

  emailFailures.reset(emailKey);

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    teamIds: user.teams.map((t) => t.teamId),
  };
}

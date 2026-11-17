import type { EmailTyp } from "@prisma/client";
import { prisma } from "./db";

/**
 * Prevents overlapping runs of one cron job within this process. Mail jobs
 * run for minutes (delays between mails), so a retried or double-triggered
 * task would otherwise send everything twice in parallel.
 */
export function createRunGuard() {
  let running = false;
  return async function runExclusive<T>(fn: () => Promise<T>): Promise<{ ran: false } | { ran: true; result: T }> {
    if (running) return { ran: false };
    running = true;
    try {
      return { ran: true, result: await fn() };
    } finally {
      running = false;
    }
  };
}

// Daily jobs: a recipient gets at most one mail of a type within this window,
// even if the job is triggered again (manual run, platform retry)
const RESEND_WINDOW_MS = 12 * 60 * 60 * 1000;

/** Recipients who already received a mail of this type in the last 12 hours. */
export async function bereitsBenachrichtigt(typ: EmailTyp, now = new Date()): Promise<Set<string>> {
  const logs = await prisma.emailLog.findMany({
    where: {
      typ,
      status: "GESENDET",
      gesendetAm: { gte: new Date(now.getTime() - RESEND_WINDOW_MS) },
    },
    select: { empfaengerEmail: true },
  });
  return new Set(logs.map((l) => l.empfaengerEmail));
}

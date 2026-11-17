import type { Session } from "next-auth";
import { prisma } from "@/lib/db";

/**
 * Team-Zuordnung von Aktionen. Eine Aktion kann mehreren Teams gehoeren
 * (z. B. Themen-Team "Flyern" + Bezirks-Team "Ost"). Zugriff hat jedes
 * Mitglied eines zugeordneten Teams sowie die Person, die die Aktion angelegt hat.
 */

// Prisma-Include, das die Teams einer Aktion als { team: { id, name } }[] laedt
export const TEAMS_INCLUDE = {
  select: { team: { select: { id: true, name: true } } },
} as const;

interface WithTeamRelation {
  teams: { team: { id: string; name: string } }[];
}

// { teams: [{ team: {...} }] } → { teams: [{ id, name }] } fuer API-Antworten
export function flattenTeams<T extends WithTeamRelation>(
  aktion: T
): Omit<T, "teams"> & { teams: { id: string; name: string }[] } {
  return { ...aktion, teams: aktion.teams.map((t) => t.team) };
}

/**
 * Prisma-where fuer Aktionen, die ein EXPERT sehen und bearbeiten darf:
 * Aktionen eines seiner Teams oder selbst angelegte.
 */
export function expertAktionWhere(user: Session["user"]) {
  const teamIds = user.teamIds ?? [];
  return {
    OR: [
      ...(teamIds.length > 0 ? [{ teams: { some: { teamId: { in: teamIds } } } }] : []),
      { createdById: user.id },
    ],
  };
}

export function hasAktionAccess(
  user: Session["user"],
  aktion: { createdById: string; teams: { teamId: string }[] }
): boolean {
  if (user.role === "ADMIN") return true;
  if (aktion.createdById === user.id) return true;
  const teamIds = user.teamIds ?? [];
  return aktion.teams.some((t) => teamIds.includes(t.teamId));
}

/**
 * Regel gegen Selbst-Aussperren: Wer eine fremde Aktion (nicht selbst angelegt)
 * bearbeitet, muss mindestens eines seiner eigenen Teams zugeordnet lassen.
 */
export function keepsOwnTeam(
  user: Session["user"],
  aktion: { createdById: string },
  newTeamIds: string[]
): boolean {
  if (user.role === "ADMIN") return true;
  if (aktion.createdById === user.id) return true;
  const teamIds = user.teamIds ?? [];
  return newTeamIds.some((id) => teamIds.includes(id));
}

export const EIGENES_TEAM_BEHALTEN_FEHLER =
  "Mindestens eines deiner eigenen Teams muss der Aktion zugeordnet bleiben, sonst kannst du sie nicht mehr bearbeiten.";

export const UNBEKANNTES_TEAM_FEHLER = "Mindestens ein ausgewähltes Team existiert nicht.";

// Prueft, ob alle IDs zu existierenden Teams gehoeren
export async function teamsExist(teamIds: string[]): Promise<boolean> {
  if (teamIds.length === 0) return true;
  const count = await prisma.team.count({ where: { id: { in: teamIds } } });
  return count === teamIds.length;
}

// Entfernt Duplikate und leere Werte
export function normalizeTeamIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((v): v is string => typeof v === "string" && v.length > 0))];
}

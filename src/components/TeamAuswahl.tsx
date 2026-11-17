"use client";

interface Team {
  id: string;
  name: string;
}

interface TeamAuswahlProps {
  teams: Team[];
  value: string[];
  onChange: (teamIds: string[]) => void;
  // Teams der angemeldeten Person; werden als "dein Team" markiert
  ownTeamIds?: string[];
  isAdmin?: boolean;
  hint?: string;
}

// Mehrfachauswahl der Teams einer Aktion (z. B. Themen-Team + Bezirks-Team)
export default function TeamAuswahl({
  teams,
  value,
  onChange,
  ownTeamIds = [],
  isAdmin = false,
  hint,
}: TeamAuswahlProps) {
  function toggle(teamId: string) {
    onChange(value.includes(teamId) ? value.filter((id) => id !== teamId) : [...value, teamId]);
  }

  return (
    <fieldset className="w-full">
      <legend className="block text-sm font-bold case-ui tracking-ui text-ink mb-1">Teams</legend>
      <p className="text-sm text-gray-600 mb-2">
        Du kannst mehrere Teams auswählen, z.&nbsp;B. euer Themen-Team und das Team vor Ort.
        Alle Mitglieder dieser Teams können die Aktion bearbeiten und die Anmeldungen sehen.
        {isAdmin && " Ohne Auswahl sehen die Aktion nur Admins."}
        {hint && ` ${hint}`}
      </p>
      {teams.length === 0 ? (
        <p className="text-sm text-gray-600">Keine Teams vorhanden</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {teams.map((team) => (
            <label key={team.id} className="flex items-center gap-2 cursor-pointer py-1">
              <input
                type="checkbox"
                checked={value.includes(team.id)}
                onChange={() => toggle(team.id)}
                className="w-5 h-5 accent-primary cursor-pointer shrink-0"
              />
              <span className="text-ink">
                {team.name}
                {ownTeamIds.includes(team.id) && (
                  <span className="text-sm text-gray-600"> (dein Team)</span>
                )}
              </span>
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}

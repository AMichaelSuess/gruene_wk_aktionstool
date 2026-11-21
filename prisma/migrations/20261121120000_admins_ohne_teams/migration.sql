-- Admins haben ueber ihre Rolle Zugriff auf alle Teams; Team-Mitgliedschaften
-- sind fuer sie bedeutungslos. Alte Eintraege aus der Zeit, als Admins beim
-- Anlegen von Aktionen noch von ihren Teams abhingen, blockierten das Loeschen
-- von Teams und blaehten die Mitgliederzahlen auf.
DELETE FROM "user_teams"
WHERE "userId" IN (SELECT "id" FROM "users" WHERE "role" = 'ADMIN');

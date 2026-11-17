import { checkConfig } from "@/lib/config-check";

// Node.js-only part of src/instrumentation.ts (uses process.exit).
const { errors, warnings } = checkConfig();
for (const w of warnings) console.warn(`Konfiguration: ${w}`);

if (errors.length > 0) {
  const message = `Konfiguration unvollständig:\n- ${errors.join("\n- ")}`;
  if (process.env.NODE_ENV === "production") {
    // Fail fast: better no start than mails with wrong links or open
    // endpoints. Exiting makes the container visibly fail in Coolify.
    console.error(message);
    process.exit(1);
  }
  console.warn(message);
}

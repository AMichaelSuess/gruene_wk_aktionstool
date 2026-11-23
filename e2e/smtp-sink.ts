/**
 * Stand-in for the mail server during E2E runs: accepts every connection and
 * closes it right away. Sending fails at once and is logged as FEHLER in
 * EmailLog, so no mail leaves the machine and no request waits for a timeout
 * (a closed port can hang for ~20 s instead of refusing, e.g. under WSL).
 */
import net from "net";
import { E2E_SMTP_PORT } from "./env";

export default async function globalSetup() {
  const server = net.createServer((socket) => socket.destroy());
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(E2E_SMTP_PORT, "127.0.0.1", resolve);
  });
  return () => new Promise<void>((resolve) => server.close(() => resolve()));
}

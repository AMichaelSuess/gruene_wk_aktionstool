import Link from "next/link";
import type { Session } from "next-auth";

interface Props {
  session: Session | null;
}

// Eingeloggte sehen auf der oeffentlichen Seite nur den Wechsel in den internen Bereich,
// gestaltet wie das Gegenstueck "Oeffentliche Seite ansehen" im internen Bereich.
export default function NavAuthSection({ session }: Props) {
  if (!session) {
    return null;
  }

  return (
    <Link
      href="/manage/actions"
      className="text-sm font-medium text-white/70 hover:text-white transition-colors"
    >
      Zum internen Bereich →
    </Link>
  );
}

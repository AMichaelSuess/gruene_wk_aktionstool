"use client";

import { signOut } from "next-auth/react";

// Abmelden im Footer der oeffentlichen Seiten, an der Stelle des Login-Links
export default function LogoutLink() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/" })}
      className="hover:text-white transition-colors case-ui tracking-ui font-bold"
    >
      Logout
    </button>
  );
}

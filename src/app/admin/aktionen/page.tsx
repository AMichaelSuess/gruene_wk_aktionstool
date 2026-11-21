import { redirect } from "next/navigation";

// Die Aktionsliste fuer Admins ist im Dashboard aufgegangen (dort zeigt sie alle Aktionen)
export default function AdminAktionenPage() {
  redirect("/dashboard");
}

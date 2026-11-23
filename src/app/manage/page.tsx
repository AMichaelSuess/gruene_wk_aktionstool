import { redirect } from "next/navigation";

// Der interne Bereich beginnt mit der Aktionsliste
export default function ManagePage() {
  redirect("/manage/actions");
}

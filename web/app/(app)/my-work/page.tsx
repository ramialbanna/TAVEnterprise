import { redirect } from "next/navigation";

/** New-mode nav target — opens Opportunities on the Mine queue tab. */
export default function MyWorkPage() {
  redirect("/opportunities?view=mine");
}

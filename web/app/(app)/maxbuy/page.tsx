import { redirect } from "next/navigation";

/** Legacy lane lookup URL — combined valuation lives on `/mmr-lab`. */
export default function MaxBuyPage() {
  redirect("/mmr-lab");
}

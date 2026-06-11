import { redirect } from "next/navigation";

/** Legacy route — combined MMR + MaxBuy workspace lives at `/mmr-lab` (MLB-1, OPEN-MLB-4). */
export default function MaxBuyPage() {
  redirect("/mmr-lab");
}

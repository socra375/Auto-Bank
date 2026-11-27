import type { Metadata } from "next";
import { StagePage } from "@/components/shell/stage-page";

export const metadata: Metadata = { title: "Movimientos" };

export default function Page() {
  return <StagePage title="Movimientos" stage={4} description="Aquí se listarán todos tus ingresos, gastos y transferencias." />;
}

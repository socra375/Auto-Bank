import type { Metadata } from "next";
import { StagePage } from "@/components/shell/stage-page";

export const metadata: Metadata = { title: "Ingresos" };

export default function Page() {
  return <StagePage title="Ingresos" stage={4} description="Aquí se listarán tus ingresos." />;
}

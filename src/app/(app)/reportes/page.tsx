import type { Metadata } from "next";
import { StagePage } from "@/components/shell/stage-page";

export const metadata: Metadata = { title: "Reportes" };

export default function Page() {
  return <StagePage title="Reportes" stage={7} description="Aquí podrás generar reportes y exportarlos." />;
}

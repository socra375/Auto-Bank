import type { Metadata } from "next";
import { StagePage } from "@/components/shell/stage-page";

export const metadata: Metadata = { title: "Overview" };

export default function Page() {
  return <StagePage title="Overview" stage={7} description="Aquí verás el resumen de tus finanzas cuando existan datos reales." />;
}

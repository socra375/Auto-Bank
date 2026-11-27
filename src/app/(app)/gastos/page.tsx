import type { Metadata } from "next";
import { StagePage } from "@/components/shell/stage-page";

export const metadata: Metadata = { title: "Gastos" };

export default function Page() {
  return <StagePage title="Gastos" stage={4} description="Aquí se listarán tus gastos." />;
}

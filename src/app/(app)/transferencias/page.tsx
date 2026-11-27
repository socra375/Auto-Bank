import type { Metadata } from "next";
import { StagePage } from "@/components/shell/stage-page";

export const metadata: Metadata = { title: "Transferencias" };

export default function Page() {
  return <StagePage title="Transferencias" stage={4} description="Aquí se listarán tus transferencias entre cuentas." />;
}

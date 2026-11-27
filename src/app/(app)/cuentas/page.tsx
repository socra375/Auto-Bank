import type { Metadata } from "next";
import { StagePage } from "@/components/shell/stage-page";

export const metadata: Metadata = { title: "Cuentas" };

export default function Page() {
  return <StagePage title="Cuentas" stage={4} description="Aquí verás tus cuentas y sus saldos, siempre separados por moneda." />;
}

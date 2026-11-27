import type { Metadata } from "next";
import { StagePage } from "@/components/shell/stage-page";

export const metadata: Metadata = { title: "Patrimonio" };

export default function Page() {
  return <StagePage title="Patrimonio" stage={6} description="Aquí verás tus bienes y tu patrimonio neto por moneda." />;
}

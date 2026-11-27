import type { Metadata } from "next";
import { StagePage } from "@/components/shell/stage-page";

export const metadata: Metadata = { title: "Market Watch" };

export default function Page() {
  return <StagePage title="Market Watch" stage={8} description="Aquí verás cotizaciones con su estado y hora reales." />;
}

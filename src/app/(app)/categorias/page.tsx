import type { Metadata } from "next";
import { StagePage } from "@/components/shell/stage-page";

export const metadata: Metadata = { title: "Categorías" };

export default function Page() {
  return <StagePage title="Categorías" stage={4} description="Aquí podrás administrar tus categorías de ingresos y gastos." />;
}

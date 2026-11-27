import type { Metadata } from "next";
import { StagePage } from "@/components/shell/stage-page";

export const metadata: Metadata = { title: "Préstamos y deudas" };

export default function Page() {
  return <StagePage title="Préstamos y deudas" stage={5} description="Aquí llevarás lo que te deben y lo que debes." />;
}

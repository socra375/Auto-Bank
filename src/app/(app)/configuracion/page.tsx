import type { Metadata } from "next";
import { StagePage } from "@/components/shell/stage-page";

export const metadata: Metadata = { title: "Configuración" };

export default function Page() {
  return <StagePage title="Configuración" stage={3} description="Aquí configurarás tu perfil, monedas, tipos de cambio y seguridad." />;
}

import { EmptyState } from "@/components/states/states";
import { PageHeader } from "./page-header";

export function StagePage({ title, stage, description }: { title: string; stage: number; description: string }) {
  return (
    <>
      <PageHeader title={title} />
      <EmptyState title={`Disponible en la etapa ${stage}`} description={description} />
    </>
  );
}

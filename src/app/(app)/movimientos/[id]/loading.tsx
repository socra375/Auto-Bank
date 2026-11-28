import { SkeletonPage, SkHeader, SkCards, SkTable } from "@/components/states/skeletons";

export default function Loading() {
  return (
    <SkeletonPage label="Cargando movimiento…">
      <SkHeader />
      <SkCards n={1} h="h-48" cols="" />
      <SkTable rows={3} />
    </SkeletonPage>
  );
}

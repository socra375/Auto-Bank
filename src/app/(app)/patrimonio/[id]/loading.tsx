import { SkeletonPage, SkHeader, SkCards, SkTable } from "@/components/states/skeletons";

export default function Loading() {
  return (
    <SkeletonPage label="Cargando bien…">
      <SkHeader />
      <SkCards n={1} h="h-40" cols="" />
      <SkTable rows={4} />
    </SkeletonPage>
  );
}

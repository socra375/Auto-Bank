import { SkeletonPage, SkHeader, SkCards, SkTable } from "@/components/states/skeletons";

export default function Loading() {
  return (
    <SkeletonPage label="Cargando préstamo…">
      <SkHeader />
      <SkCards n={1} h="h-36" cols="" />
      <SkTable rows={4} />
    </SkeletonPage>
  );
}

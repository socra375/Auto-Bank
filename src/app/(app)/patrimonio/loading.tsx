import { SkeletonPage, SkHeader, SkPills, SkCards } from "@/components/states/skeletons";

export default function Loading() {
  return (
    <SkeletonPage label="Cargando patrimonio…">
      <SkHeader />
      <SkPills n={3} />
      <SkCards n={2} h="h-44" cols="md:grid-cols-2" />
      <SkCards n={1} h="h-72" cols="" />
      <SkCards n={2} h="h-32" cols="lg:grid-cols-2" />
    </SkeletonPage>
  );
}

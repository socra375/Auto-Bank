import { SkeletonPage, SkHeader, SkPills, SkFilters, SkCards } from "@/components/states/skeletons";

export default function Loading() {
  return (
    <SkeletonPage label="Cargando préstamos…">
      <SkHeader action />
      <SkCards n={2} h="h-40" cols="sm:grid-cols-2" />
      <SkPills n={2} />
      <SkFilters />
      <SkCards n={2} h="h-32" cols="lg:grid-cols-2" />
    </SkeletonPage>
  );
}

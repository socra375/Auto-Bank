import { SkeletonPage, SkHeader, SkPills, SkCards } from "@/components/states/skeletons";

export default function Loading() {
  return (
    <SkeletonPage label="Cargando reportes…">
      <SkHeader />
      <SkPills n={5} />
      <SkCards n={1} h="h-72" cols="" />
      <SkCards n={1} h="h-60" cols="" />
    </SkeletonPage>
  );
}

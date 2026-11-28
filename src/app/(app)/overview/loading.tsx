import { SkeletonPage, SkHeader, SkPills, SkBankCards, SkCards } from "@/components/states/skeletons";

export default function Loading() {
  return (
    <SkeletonPage label="Cargando resumen…">
      <SkHeader />
      <SkPills n={5} />
      <SkBankCards />
      <SkCards n={2} h="h-72" cols="lg:grid-cols-2" />
    </SkeletonPage>
  );
}

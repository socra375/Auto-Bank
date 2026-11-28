import { SkeletonPage, SkHeader, SkForm, SkCards } from "@/components/states/skeletons";

export default function Loading() {
  return (
    <SkeletonPage label="Cargando categorías…">
      <SkHeader />
      <SkForm />
      <SkCards n={2} h="h-72" cols="lg:grid-cols-2" />
    </SkeletonPage>
  );
}

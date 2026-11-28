import { SkeletonPage, SkHeader, SkCards, SkForm, SkAccountGrid } from "@/components/states/skeletons";

export default function Loading() {
  return (
    <SkeletonPage label="Cargando cuentas…">
      <SkHeader />
      <SkCards n={2} h="h-28" cols="sm:grid-cols-2" />
      <SkForm />
      <SkAccountGrid />
    </SkeletonPage>
  );
}

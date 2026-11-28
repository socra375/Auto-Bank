import { SkeletonPage, SkHeader, SkForm, SkFilters, SkTable } from "@/components/states/skeletons";

export default function Loading() {
  return (
    <SkeletonPage label="Cargando transferencias…">
      <SkHeader />
      <SkForm />
      <SkFilters />
      <SkTable />
    </SkeletonPage>
  );
}

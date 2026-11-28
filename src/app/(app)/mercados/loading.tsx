import { SkeletonPage, SkHeader, SkPills, SkTable } from "@/components/states/skeletons";

export default function Loading() {
  return (
    <SkeletonPage label="Cargando mercados…">
      <SkHeader />
      <SkPills n={6} />
      <SkTable rows={8} />
    </SkeletonPage>
  );
}

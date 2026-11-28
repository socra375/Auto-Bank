import { SkeletonPage, SkHeader, SkCards } from "@/components/states/skeletons";

export default function Loading() {
  return (
    <SkeletonPage label="Cargando configuración…">
      <SkHeader />
      <SkCards n={1} h="h-32" cols="" />
      <SkCards n={1} h="h-72" cols="" />
    </SkeletonPage>
  );
}

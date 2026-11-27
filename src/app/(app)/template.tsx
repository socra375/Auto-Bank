import { requireOwner } from "@/lib/auth/guard";

export default async function AppTemplate({ children }: { children: React.ReactNode }) {
  await requireOwner();
  return children;
}

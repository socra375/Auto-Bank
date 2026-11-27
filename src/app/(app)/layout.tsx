import { AppShell } from "@/components/shell/app-shell";
import { requireOwner } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireOwner();
  return <AppShell>{children}</AppShell>;
}

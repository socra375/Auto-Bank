import { cookies } from "next/headers";
import { AppShell } from "@/components/shell/app-shell";
import { requireOwner } from "@/lib/auth/guard";
import { SIDEBAR_COOKIE } from "@/lib/theme";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireOwner();
  const collapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === "1";
  return <AppShell initialCollapsed={collapsed}>{children}</AppShell>;
}

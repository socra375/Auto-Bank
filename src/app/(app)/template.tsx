import { requireOwner } from "@/lib/auth/guard";

export default async function AppTemplate({ children }: { children: React.ReactNode }) {
  await requireOwner();
  // Templates remount on every navigation, which replays the section reveal (CSS only, see docs/MOTION.md).
  return <div className="stagger">{children}</div>;
}

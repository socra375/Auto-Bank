import { NAV } from "./nav";
import { NavLink } from "./nav-link";

export function NavList({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  return (
    <ul className="space-y-1">
      {NAV.map((group, i) => (
        <li key={i} className={i > 0 ? "pt-4" : undefined}>
          {group.label && (
            <p className={collapsed ? "sr-only" : "px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-white/60"}>{group.label}</p>
          )}
          <ul className="space-y-1">
            {group.items.map((item) => (
              <li key={item.href}>
                <NavLink item={item} collapsed={collapsed} onNavigate={onNavigate} />
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

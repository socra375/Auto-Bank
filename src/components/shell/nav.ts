import {
  ArrowLeftRight, ArrowDownToLine, ArrowUpFromLine, Banknote, Building2, Landmark,
  LayoutDashboard, LineChart, PieChart, Repeat, Settings, Tags, type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; stage: number };
export type NavGroup = { label?: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  { items: [{ href: "/overview", label: "Overview", icon: LayoutDashboard, stage: 7 }] },
  {
    label: "Finanzas",
    items: [
      { href: "/movimientos", label: "Movimientos", icon: ArrowLeftRight, stage: 4 },
      { href: "/ingresos", label: "Ingresos", icon: ArrowDownToLine, stage: 4 },
      { href: "/gastos", label: "Gastos", icon: ArrowUpFromLine, stage: 4 },
      { href: "/transferencias", label: "Transferencias", icon: Repeat, stage: 4 },
      { href: "/categorias", label: "Categorías", icon: Tags, stage: 4 },
    ],
  },
  {
    items: [
      { href: "/cuentas", label: "Cuentas", icon: Landmark, stage: 4 },
      { href: "/prestamos", label: "Préstamos y deudas", icon: Banknote, stage: 5 },
      { href: "/patrimonio", label: "Patrimonio", icon: Building2, stage: 6 },
      { href: "/mercados", label: "Market Watch", icon: LineChart, stage: 8 },
      { href: "/reportes", label: "Reportes", icon: PieChart, stage: 7 },
      { href: "/configuracion", label: "Configuración", icon: Settings, stage: 3 },
    ],
  },
];

export const ALL_ITEMS = NAV.flatMap((g) => g.items);
// Shown in the mobile bottom bar; the rest live in the drawer.
export const MOBILE_PRIMARY = ["/overview", "/movimientos", "/cuentas", "/prestamos"];

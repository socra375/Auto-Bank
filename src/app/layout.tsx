import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { cookies } from "next/headers";
import { FormValidation } from "@/components/ui/form-validation";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";
import "@/styles/globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Auto-Bank", template: "%s · Auto-Bank" },
  description: "Finanzas personales en DOP y USD.",
};

/** The saved theme (cookie) also tells the browser which native UI scheme to use before the CSS loads. */
export async function generateViewport(): Promise<Viewport> {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return { colorScheme: theme === "system" ? "light dark" : theme, themeColor: theme === "dark" ? "#0b1520" : "#f4f7fa" };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html lang="es-DO" data-theme={theme} className={inter.variable}>
      <body>
        {children}
        <FormValidation />
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "@/styles/globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Auto-Bank", template: "%s · Auto-Bank" },
  description: "Finanzas personales en DOP y USD.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-DO" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}

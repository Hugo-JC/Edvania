import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Edvânia — Assistente Comercial",
  description: "Gestão comercial simples e inteligente para negócios em Angola.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-AO">
      <body>{children}</body>
    </html>
  );
}

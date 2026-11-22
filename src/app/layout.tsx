import type { Metadata } from "next";
import { DM_Sans, IBM_Plex_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { MotionProvider } from "@/components/motion-primitives";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-display",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Edvânia — Assistente Comercial",
  description: "Gestão comercial simples e inteligente para negócios em Angola.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="pt-AO"
      className={`${plusJakarta.variable} ${dmSans.variable} ${ibmPlexMono.variable}`}
    >
      <body className="antialiased selection:bg-[#146C53]/15 selection:text-[#0F5340]">
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}

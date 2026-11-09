import type { Metadata } from "next";
import { Cinzel, Inter } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "next-auth/react";
import DevModelToggle from "@/components/DevModelToggle";

const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Bardo — La memoria de tu campaña",
  description: "Consulta y gestión de notas para campañas de rol",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${cinzel.variable} ${inter.variable} h-full`}>
      <body className="min-h-full bg-black text-zinc-100 antialiased">
        <SessionProvider>{children}</SessionProvider>
        <DevModelToggle />
      </body>
    </html>
  );
}

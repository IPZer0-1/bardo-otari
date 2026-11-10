import type { Metadata } from "next";
import { Cinzel, Inter } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "next-auth/react";
import DevModelToggle from "@/components/DevModelToggle";
import { getCurrentProvider, isValidProvider } from "@/lib/llm-provider";

// El selector de provider solo existe en desarrollo; en producción no se
// consulta nada aquí y el layout sigue siendo estático.
const isDev = process.env.NODE_ENV === "development";

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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${cinzel.variable} ${inter.variable} h-full`}>
      <body className="min-h-full bg-black text-zinc-100 antialiased">
        <SessionProvider>{children}</SessionProvider>
        {isDev && <DevModelToggle current={await getCurrentProvider()} otariAvailable={isValidProvider("otari")} />}
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Sidebar } from "@/components/sidebar";
import { Header } from "@/components/header";
import { MobileNav } from "@/components/mobile-nav";
import { Toaster } from "@/components/ui/toaster";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ArbitrageX Supreme V3.6",
  description: "Dashboard de monitoreo y configuración para el sistema de arbitraje automático ArbitrageX Supreme",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={`${inter.className} theme-transition`}>
        <Providers>
          <div className="flex h-screen overflow-hidden">
            <Sidebar />
            <div className="flex-1 flex flex-col overflow-hidden">
              <Header />
              <main className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 bg-background has-mobile-nav md:pb-6 pb-20">
                {children}
              </main>
            </div>
          </div>
          <MobileNav />
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}

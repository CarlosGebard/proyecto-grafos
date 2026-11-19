import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

// Fuentes OFL vendidas en public/fonts (sin red en build; misma familia que el visor estático).
const oswald = localFont({
  src: "../../public/fonts/oswald-200-700-normal.woff2",
  variable: "--font-display",
  weight: "200 700",
});

const archivo = localFont({
  src: "../../public/fonts/archivo-100-900-normal.woff2",
  variable: "--font-body",
  weight: "100 900",
});

const plexMono = localFont({
  src: [
    { path: "../../public/fonts/ibm-plex-mono-400-normal.woff2", weight: "400" },
    { path: "../../public/fonts/ibm-plex-mono-500-normal.woff2", weight: "500" },
    { path: "../../public/fonts/ibm-plex-mono-600-normal.woff2", weight: "600" },
  ],
  variable: "--font-carto",
});

export const metadata: Metadata = {
  title: "Red Austral — Simulador de Conectividad Rural de Chile",
  description:
    "Optimización de cobertura territorial mediante grafos: localidades aisladas de Chile, su historia digital y el impacto que tendría llevarles banda ancha.",
  keywords: ["conectividad", "Chile", "rural", "simulación", "brecha digital", "Subtel", "FDT"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body
        className={`${oswald.variable} ${archivo.variable} ${plexMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}

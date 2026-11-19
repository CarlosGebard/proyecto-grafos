"use client";

import Image from "next/image";
import { ArrowRight, Compass, Landmark, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";

type LandingProps = {
  onEnterAtlas: () => void;
};

/* dispositivo gráfico: haz de rayos radiales (lenguaje de la referencia) */
function RayBurst({ className, rays = 48 }: { className?: string; rays?: number }) {
  const items = Array.from({ length: rays });
  return (
    <svg viewBox="-110 -110 220 220" className={className} aria-hidden="true">
      {items.map((_, i) => {
        const a = (i / rays) * Math.PI * 2;
        const r1 = 28 + ((i * 37) % 34);
        // se redondea a 2 decimales para que SSR y cliente generen el mismo string
        const x1 = (Math.cos(a) * r1).toFixed(2);
        const y1 = (Math.sin(a) * r1).toFixed(2);
        const x2 = (Math.cos(a) * 106).toFixed(2);
        const y2 = (Math.sin(a) * 106).toFixed(2);
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="currentColor"
            strokeWidth="0.9"
          />
        );
      })}
    </svg>
  );
}

const STEPS = [
  {
    num: "01",
    icon: Landmark,
    title: "Diagnóstico con datos reales",
    body: "Localidades con población (SUBDERE/Censo) y cartas de impacto investigadas sobre fuentes públicas. No se simula sobre lugares inventados.",
  },
  {
    num: "02",
    icon: Radio,
    title: "Modelación y motor exacto",
    body: "Candidatos por criterio territorial sobre un DEM real (Copernicus GLO-30), cobertura por distancia + línea de vista, y un motor exacto (ESU + poda) que elige hasta k antenas maximizando la población única cubierta con la red conectada.",
  },
  {
    num: "03",
    icon: Compass,
    title: "Simulación verificable del impacto",
    body: "Cada cifra del visor se lee de los artefactos versionados de la corrida (metrics.json): cobertura, estados por localidad y restricciones realmente aplicadas.",
  },
];

const STATS = [
  { value: "196.156", label: "hogares (3,4 % del país) siguen sin acceso propio a internet; el hogar desconectado típico es rural, del segmento E (Hogares Conectados 2026, País Digital + Casen 2024)." },
  { value: "827", label: "localidades de los tres pilotos evaluadas sobre el relieve real (DEM Copernicus GLO-30), con cobertura por distancia y línea de vista." },
  { value: "k = 5", label: "antenas por piloto elegidas por el motor exacto (ESU + poda), maximizando la población única cubierta con la red en un solo componente." },
];

export function Landing({ onEnterAtlas }: LandingProps) {
  return (
    <>
      {/* cabecera */}
      <header className="border-b border-ink/15 bg-paper">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <a href="#inicio" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center bg-ink font-medium text-paper" style={{ fontFamily: "var(--font-carto)" }}>
              RA
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-semibold uppercase tracking-[0.14em] text-ink">Red Austral</span>
              <span className="block text-[10px] uppercase tracking-[0.24em] text-ink-soft" style={{ fontFamily: "var(--font-carto)" }}>
                Simulador de conectividad
              </span>
            </span>
          </a>
          <nav aria-label="Secciones" className="hidden items-center gap-7 text-xs font-medium uppercase tracking-[0.18em] text-ink-soft md:flex">
            <a href="#problema" className="transition-colors hover:text-cobalt">El problema</a>
            <a href="#solucion" className="transition-colors hover:text-cobalt">La solución</a>
            <a href="#atlas" className="transition-colors hover:text-cobalt">El mapa</a>
          </nav>
          <Button onClick={onEnterAtlas} size="sm" className="gap-1.5 rounded-none bg-cobalt text-xs font-medium uppercase tracking-[0.14em] text-paper hover:bg-cobalt-deep">
            Ver simulaciones <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </div>
      </header>

      <main id="inicio" className="flex-1">
        {/* ── héroe: cobalto plano + grabación duotono + haz de rayos ── */}
        <section className="relative overflow-hidden bg-cobalt text-white">
          <Image
            src="/hero-austral.jpg"
            alt="Vista nocturna de una localidad austral de Chile con luces cálidas sobre pasarelas junto al fiordo, en tratamiento duotono azul"
            fill
            priority
            sizes="100vw"
            className="object-cover grayscale contrast-125 mix-blend-multiply"
          />
          {/* duotono: las sombras suben a azul naval como en una grabación */}
          <div className="absolute inset-0 bg-night mix-blend-lighten" aria-hidden />
          <div className="absolute inset-0 bg-gradient-to-b from-cobalt/55 via-transparent to-night/75" aria-hidden />
          <RayBurst className="absolute -right-24 -top-24 h-[560px] w-[560px] text-white/30 md:right-6" />
          <RayBurst className="absolute -bottom-32 left-1/3 h-[420px] w-[420px] text-white/15" rays={36} />
          <div className="relative mx-auto flex max-w-6xl flex-col justify-center px-4 pb-20 pt-24 sm:px-6 md:pb-28 md:pt-32">
            <p className="text-xs font-medium uppercase tracking-[0.3em] text-signal" style={{ fontFamily: "var(--font-carto)" }}>
              Modelo de simulación social · Chile · 18°S — 56°S
            </p>
            <h1
              className="mt-5 max-w-3xl text-5xl font-light leading-[1.04] tracking-tight sm:text-6xl md:text-7xl"
              style={{ fontFamily: "var(--font-display)" }}
            >
              La distancia no debería significar el silencio digital.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-relaxed text-white/80 md:text-lg">
              Miles de localidades chilenas del campo al periurbano siguen fuera del mapa de la banda ancha.
              Red Austral resuelve de forma exacta dónde poner k antenas para cubrir la mayor población posible —
              con línea de vista sobre el relieve real y la red conectada — y lo muestra sobre tres pilotos con
              datos versionados: Yumbel, Laja–Salto del Laja y la cuenca de Angostura.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Button
                onClick={onEnterAtlas}
                size="lg"
                className="max-w-full gap-2 whitespace-normal! rounded-none bg-signal px-5 text-center text-sm font-medium uppercase tracking-[0.14em] text-cobalt hover:bg-signal-hot"
              >
                Explorar el mapa con las simulaciones
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="rounded-none border-white/40 bg-transparent text-xs font-medium uppercase tracking-[0.14em] text-white hover:bg-white/10 hover:text-white"
              >
                <a href="#problema">Conocer el problema</a>
              </Button>
            </div>
            <p className="mt-12 text-[11px] uppercase tracking-[0.22em] text-white/50" style={{ fontFamily: "var(--font-carto)" }}>
              Fuentes: Fundación País Digital · Subtel · Censo 2017 (INE) · DEM Copernicus GLO-30
            </p>
          </div>
        </section>

        {/* ── el problema ── */}
        <section id="problema" className="bg-paper py-16 md:py-24">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 md:grid-cols-[1.2fr_1fr] md:gap-16">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.3em] text-cobalt" style={{ fontFamily: "var(--font-carto)" }}>
                01 — El problema
              </p>
              <h2 className="mt-3 max-w-xl text-4xl font-light leading-[1.08] tracking-tight text-ink md:text-5xl" style={{ fontFamily: "var(--font-display)" }}>
                Chile conecta a sus ciudades, pero deja al resto del país fuera de línea.
              </h2>
              <div className="mt-6 space-y-4 text-[15px] leading-relaxed text-ink-soft">
                <p>
                  Chile destaca en los ranking latinoamericanos de penetración digital urbana, pero esa media esconde
                  una geografía desigual: comunas cordilleranas, islas del mar interior, costas de fiordos y altiplanos
                  fronterizos donde la señal es intermitente, la velocidad no sirve para telesalud y una lluvia o una
                  tormenta basta para borrar la única conexión disponible.
                </p>
                <p>
                  No es un problema de proporciones sino de consecuencias: para las 435 localidades dispersas de la
                  ventana de Yumbel o las postas de secano alrededor de Laja, no tener banda ancha significa
                  trasladarse horas por una consulta médica de rutina, preparar tareas con cuadernos impresos y
                  renunciar a vender su trabajo más allá del pueblo.
                </p>
              </div>
            </div>
            <div className="flex flex-col justify-center gap-8">
              {STATS.map((s) => (
                <div key={s.value} className="border-t-2 border-ink pt-3">
                  <p className="text-5xl font-light tracking-tight text-ink" style={{ fontFamily: "var(--font-display)" }}>
                    {s.value}
                  </p>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── la solución ── */}
        <section id="solucion" className="border-y border-ink/15 bg-paper-deep py-16 md:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <p className="text-xs font-medium uppercase tracking-[0.3em] text-cobalt" style={{ fontFamily: "var(--font-carto)" }}>
              02 — La solución
            </p>
            <h2 className="mt-3 max-w-2xl text-4xl font-light leading-[1.08] tracking-tight text-ink md:text-5xl" style={{ fontFamily: "var(--font-display)" }}>
              Un modelo interactivo que convierte la brecha digital en territorio explorable.
            </h2>
            <div className="mt-10">
              {STEPS.map(({ num, icon: Icon, title, body }) => (
                <div
                  key={num}
                  className="grid gap-3 border-t border-ink/20 py-6 sm:grid-cols-[64px_1fr] md:grid-cols-[64px_240px_1fr] md:items-baseline"
                >
                  <span className="text-lg font-medium text-cobalt" style={{ fontFamily: "var(--font-carto)" }}>
                    {num}
                  </span>
                  <h3 className="flex items-center gap-2 text-lg font-medium uppercase tracking-wide text-ink">
                    <Icon className="h-4 w-4 shrink-0 text-cobalt" aria-hidden />
                    {title}
                  </h3>
                  <p className="text-[15px] leading-relaxed text-ink-soft">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── llamado final al atlas ── */}
        <section id="atlas" className="relative overflow-hidden bg-cobalt py-16 text-center text-white md:py-24">
          <RayBurst className="pointer-events-none absolute left-1/2 top-1/2 h-[640px] w-[640px] -translate-x-1/2 -translate-y-1/2 text-white/15" rays={60} />
          <div className="relative mx-auto max-w-3xl px-4 sm:px-6">
            <p className="text-xs font-medium uppercase tracking-[0.3em] text-signal" style={{ fontFamily: "var(--font-carto)" }}>
              03 — El atlas
            </p>
            <h2 className="mt-3 text-4xl font-light leading-[1.08] tracking-tight md:text-5xl" style={{ fontFamily: "var(--font-display)" }}>
              Tres pilotos reales, cientos de localidades por conectar.
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-white/80">
              Explore el mapa de Chile, abra la carta social de cada piloto y ejecute su simulación paso a paso:
              localidades, candidatos, cobertura con LOS y la solución exacta conectada.
            </p>
            <Button
              onClick={onEnterAtlas}
              size="lg"
              className="mt-8 max-w-full gap-2 whitespace-normal! rounded-none bg-signal px-6 text-center text-sm font-medium uppercase tracking-[0.14em] text-cobalt hover:bg-signal-hot"
            >
              Ir al mapa con las simulaciones
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </section>
      </main>

      {/* pie pegado al fondo */}
      <footer className="mt-auto border-t border-white/10 bg-pine text-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.14em]">Red Austral</p>
            <p className="mt-2 max-w-xs text-xs leading-relaxed text-white/60">
              Visor del proyecto de optimización de cobertura territorial mediante grafos: motor exacto, pilotos
              reales y simulación verificable.
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-white/50" style={{ fontFamily: "var(--font-carto)" }}>
              Datos y fuentes
            </p>
            <p className="mt-2 text-xs leading-relaxed text-white/60">
              Subtel · FDT · Red Troncal Nacional de Fibra Óptica · WiFi Educativo · Censo 2017 (INE) · CASEN.
              Contenido resumido con fines ilustrativos.
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-white/50" style={{ fontFamily: "var(--font-carto)" }}>
              Cobertura del modelo
            </p>
            <p className="mt-2 text-xs leading-relaxed text-white/60">
              Ollagüe · Alto Biobío · Isla Apiao · Caleta Tortel · Villa Cerro Castillo · Puerto Edén.
            </p>
          </div>
        </div>
        <div className="border-t border-white/10 py-3 text-center text-[11px] uppercase tracking-[0.2em] text-white/40" style={{ fontFamily: "var(--font-carto)" }}>
          Red Austral — Mockup de rediseño · 2025
        </div>
      </footer>
    </>
  );
}

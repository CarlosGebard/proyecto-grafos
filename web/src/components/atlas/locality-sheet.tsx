"use client";

import { motion } from "framer-motion";
import { ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  formatCoord,
  formatNumber,
  type Pilot,
  type SimulationBundle,
} from "@/lib/pilots";

type LocalitySheetProps = {
  pilot: Pilot;
  bundle?: SimulationBundle;
  onClose: () => void;
  onSimulate: (pilot: Pilot) => void;
};

export function LocalitySheet({ pilot, bundle, onClose, onSimulate }: LocalitySheetProps) {
  const m = bundle?.metrics;

  return (
    <motion.aside
      key="locality-sheet"
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ duration: 0.45, ease: [0.32, 0.72, 0, 1] }}
      className="absolute inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-white/10 bg-night-2 text-white shadow-2xl md:inset-y-4 md:right-4 md:rounded-lg"
      role="dialog"
      aria-label={`Carta de impacto social: ${pilot.name}`}
    >
      {/* cabecera */}
      <header className="border-b border-white/10 px-6 pb-5 pt-6">
        <div className="flex items-start justify-between gap-3">
          <p
            className="mt-1 text-xs uppercase tracking-[0.18em] text-signal"
            style={{ fontFamily: "var(--font-carto)" }}
          >
            {pilot.kicker}
          </p>
          <button
            onClick={onClose}
            aria-label="Cerrar carta"
            className="map-focus rounded-full border border-white/15 p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <h2
          className="mt-2 text-3xl font-medium leading-tight"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {pilot.name}
        </h2>
        <p className="mt-1 text-sm text-white/60">{pilot.subtitle}</p>
        <p className="mt-3 text-sm italic leading-relaxed text-white/80">{pilot.lead}</p>
      </header>

      {/* contenido desplazable */}
      <div className="thin-scroll flex-1 overflow-y-auto px-6 py-5">
        {pilot.sections.map((section, i) => (
          <section key={section.title} className="mb-6">
            <p className="mb-2 flex items-baseline gap-2">
              <span
                className="text-xs text-signal"
                style={{ fontFamily: "var(--font-carto)" }}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <span
                className="text-[11px] uppercase tracking-[0.18em] text-white/50"
                style={{ fontFamily: "var(--font-carto)" }}
              >
                {section.title}
              </span>
            </p>
            {section.paragraphs.map((paragraph, j) => (
              <p
                key={j}
                className="mb-3 text-[15px] leading-relaxed text-white/85 last:mb-0"
              >
                {paragraph}
              </p>
            ))}
          </section>
        ))}

        {/* ficha técnica desde metrics.json de la corrida versionada */}
        <section className="mb-6">
          <p
            className="mb-3 text-[11px] uppercase tracking-[0.18em] text-white/50"
            style={{ fontFamily: "var(--font-carto)" }}
          >
            Ficha técnica
          </p>
          {m ? (
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-white/10 bg-white/10">
              <div className="bg-night-2 px-4 py-3">
                <dt className="text-[11px] uppercase tracking-wider text-white/45">
                  Localidades
                </dt>
                <dd className="mt-1 text-sm text-signal-hot">
                  {formatNumber(m.numDemandNodes)} rurales
                </dd>
              </div>
              <div className="bg-night-2 px-4 py-3">
                <dt className="text-[11px] uppercase tracking-wider text-white/45">
                  Población
                </dt>
                <dd className="mt-1 text-sm text-signal-hot">
                  {formatNumber(m.populationTotal)} hab
                </dd>
              </div>
              <div className="bg-night-2 px-4 py-3">
                <dt className="text-[11px] uppercase tracking-wider text-white/45">
                  Cobertura conectada
                </dt>
                <dd className="mt-1 text-sm text-signal-hot">
                  {m.coveragePct.toFixed(1).replace(".", ",")} %
                </dd>
              </div>
              <div className="bg-night-2 px-4 py-3">
                <dt className="text-[11px] uppercase tracking-wider text-white/45">
                  Antenas elegidas
                </dt>
                <dd className="mt-1 text-sm text-signal-hot">
                  {m.k} de {m.numCandidates} candidatas
                </dd>
              </div>
              <div className="bg-night-2 px-4 py-3">
                <dt className="text-[11px] uppercase tracking-wider text-white/45">
                  Motor exacto
                </dt>
                <dd className="mt-1 text-sm text-signal-hot">ESU + poda</dd>
              </div>
              <div className="bg-night-2 px-4 py-3">
                <dt className="text-[11px] uppercase tracking-wider text-white/45">
                  Cómputo
                </dt>
                <dd className="mt-1 text-sm text-signal-hot">
                  {m.runtimeSeconds != null
                    ? `${m.runtimeSeconds.toFixed(1).replace(".", ",")} s`
                    : "—"}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-white/50">Cargando cifras de la corrida…</p>
          )}
        </section>

        {/* fuentes */}
        <section className="mb-2 border-t border-white/10 pt-4">
          <p
            className="mb-2 text-[11px] uppercase tracking-[0.18em] text-white/50"
            style={{ fontFamily: "var(--font-carto)" }}
          >
            Fuentes
          </p>
          <ul className="space-y-1.5">
            {pilot.sources.map((s) => (
              <li key={s.url} className="text-xs text-white/55">
                —{" "}
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline decoration-white/25 underline-offset-2 transition-colors hover:text-signal"
                >
                  {s.text}
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] leading-relaxed text-white/35">
            Cifras de simulación leídas en runtime desde los artefactos versionados
            de la corrida (metrics.json, motor exacto conectado).
          </p>
        </section>
      </div>

      {/* botón de simulación bajo la carta */}
      <footer className="border-t border-white/10 bg-night px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Button
          onClick={() => onSimulate(pilot)}
          disabled={!bundle}
          className="map-focus w-full gap-2 bg-signal text-night hover:bg-signal-hot"
          size="lg"
        >
          {bundle ? (
            <>
              Ver simulación de la zona
              <ArrowRight className="h-4 w-4" aria-hidden />
            </>
          ) : (
            "Preparando simulación…"
          )}
        </Button>
      </footer>
    </motion.aside>
  );
}

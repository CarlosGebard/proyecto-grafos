"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  ListChecks,
  Minus,
  Pause,
  Play,
  Plus,
  RotateCcw,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  formatCoord,
  formatNumber,
  type Pilot,
  type SimulationBundle,
} from "@/lib/pilots";
import type { MapZoomApi } from "@/components/atlas/chile-map";

type SimulationViewProps = {
  pilot: Pilot;
  bundle: SimulationBundle;
  onExit: () => void;
  /** notifica al mapa el paso actual de la secuencia */
  onStepChange: (step: number) => void;
  /** API de zoom del mapa Leaflet real */
  zoomApi: { current: MapZoomApi };
  /** nivel de zoom actual del mapa (para la lectura del panel) */
  zoomLevel: number | null;
};

const STEP_TITLES = [
  {
    title: "Localidades y población",
    copy: "Cada punto es una localidad rural del piloto; su tamaño muestra cuánta población se busca cubrir.",
  },
  {
    title: "Posiciones candidatas",
    copy: "El criterio territorial propone sitios: anclas en localidades, intersecciones de cobertura y sitios altos del DEM, filtrados por pendiente y separación.",
  },
  {
    title: "Cobertura y línea de vista",
    copy: "Cada trazo es un par candidato–localidad alcanzable por distancia y línea de vista sobre el relieve real (Copernicus GLO-30).",
  },
  {
    title: "Solución conectada",
    copy: "El motor exacto (ESU + poda) elige hasta k antenas que maximizan la población única cubierta con la red en un solo componente. Los puntos brillantes señalan dónde queda esa población cubierta; pasa el cursor por una localidad para ver su población.",
  },
] as const;

export function SimulationView({
  pilot,
  bundle,
  onExit,
  onStepChange,
  zoomApi,
  zoomLevel,
}: SimulationViewProps) {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [showRestrictions, setShowRestrictions] = useState(false);
  const playTimer = useRef<number | null>(null);

  /* notificar al mapa el paso actual */
  useEffect(() => {
    onStepChange(step);
  }, [step, onStepChange]);

  /* reproducción paso a paso */
  useEffect(() => {
    if (!playing) {
      if (playTimer.current) window.clearInterval(playTimer.current);
      playTimer.current = null;
      return;
    }
    playTimer.current = window.setInterval(() => {
      setStep((s) => {
        if (s >= 3) {
          setPlaying(false);
          return 3;
        }
        return s + 1;
      });
    }, 2600);
    return () => {
      if (playTimer.current) window.clearInterval(playTimer.current);
      playTimer.current = null;
    };
  }, [playing]);

  const reset = () => {
    setStep(0);
    setPlaying(false);
    setShowRestrictions(false);
  };
  const next = () => setStep((s) => Math.min(3, s + 1));
  const prev = () => setStep((s) => Math.max(0, s - 1));

  const m = bundle.metrics;
  const showSolution = step >= 3;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="pointer-events-none absolute inset-0 z-50"
      role="region"
      aria-label={`Simulación del piloto ${pilot.name}`}
    >
      {/* ── columna izquierda: control, restricciones y leyenda ── */}
      <div className="pointer-events-none absolute inset-y-4 left-4 flex w-[min(92vw,320px)] flex-col gap-3">
        {/* panel de control */}
        <div className="pointer-events-auto shrink-0 rounded-lg border border-white/10 bg-night-2/90 p-4 backdrop-blur-sm">
        <p
          className="text-[10px] tracking-[0.2em] text-signal"
          style={{ fontFamily: "var(--font-carto)" }}
        >
          {formatCoord(pilot.center[1], pilot.center[0])}
        </p>
        <h2
          className="mt-1 text-xl font-medium text-white"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {pilot.name}
        </h2>
        <p className="mb-3 text-xs text-white/55">
          {pilot.subtitle} · motor exacto
        </p>

        <div className="grid grid-cols-2 gap-2">
          <Button
            variant={playing ? "secondary" : "default"}
            size="sm"
            onClick={() => {
              if (step >= 3 && !playing) setStep(0);
              setPlaying((p) => !p);
            }}
            className={`col-span-2 map-focus ${playing ? "bg-white/15 text-white hover:bg-white/25" : "bg-signal text-night hover:bg-signal-hot"}`}
            aria-pressed={playing}
          >
            {playing ? (
              <>
                <Pause className="h-3.5 w-3.5" aria-hidden /> Pausar visualización
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5" aria-hidden /> Iniciar visualización
              </>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={prev}
            disabled={step === 0}
            aria-label="Paso anterior"
            className="map-focus border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={next}
            disabled={step === 3}
            aria-label="Paso siguiente"
            className="map-focus border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
          >
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={reset}
            className="map-focus border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Reinicio
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowRestrictions((s) => !s)}
            aria-expanded={showRestrictions}
            className="map-focus border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
          >
            <ListChecks className="h-3.5 w-3.5" aria-hidden /> Restricciones
          </Button>
          <div
            className="col-span-2 flex items-center gap-1.5 rounded-md border border-white/20 px-1.5"
            role="group"
            aria-label="Zoom del mapa"
          >
            <button
              onClick={() => zoomApi.current?.zoomOut()}
              aria-label="Alejar zoom"
              className="map-focus rounded p-1.5 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            >
              <Minus className="h-3.5 w-3.5" aria-hidden />
            </button>
            <span
              className="flex-1 text-center text-[11px] text-white/60"
              style={{ fontFamily: "var(--font-carto)" }}
            >
              ZOOM {zoomLevel != null ? zoomLevel.toFixed(1) : "—"}
            </span>
            <button
              onClick={() => zoomApi.current?.zoomIn()}
              aria-label="Acercar zoom"
              className="map-focus rounded p-1.5 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        </div>

        {/* paso actual */}
        <div className="mt-3 border-t border-white/10 pt-3">
          <p
            className="text-[10px] tracking-[0.2em] text-white/45"
            style={{ fontFamily: "var(--font-carto)" }}
          >
            PASO {step + 1} DE 4
          </p>
          <p className="mt-1 text-sm font-medium text-white/90">
            {STEP_TITLES[step].title}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-white/55">
            {STEP_TITLES[step].copy}
          </p>
        </div>
      </div>

      {/* ── leyenda (anclada al pie de la columna) ── */}
      <div className="thin-scroll pointer-events-auto mt-auto w-full shrink-0 overflow-y-auto rounded-lg border border-white/10 bg-night-2/90 px-4 py-3 backdrop-blur-sm">
        <p
          className="mb-2 text-[10px] uppercase tracking-[0.2em] text-white/50"
          style={{ fontFamily: "var(--font-carto)" }}
        >
          Leyenda
        </p>
        <ul className="grid grid-cols-1 gap-y-1.5">
          <li className="flex items-center gap-2 text-xs text-white/75">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-white/60" />
            Localidad (tamaño ∝ √población)
          </li>
          {showSolution && (
            <>
              <li className="flex items-center gap-2 text-xs text-white/75">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-signal-hot shadow-[0_0_8px_2px_var(--signal-deep)]" />
                Población cubierta ({formatNumber(m.populationCovered)} hab)
              </li>
              <li className="flex items-center gap-2 text-xs text-white/75">
                <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-signal-deep bg-transparent" />
                Alcanzable · sin antena ({formatNumber(m.populationReachable)} hab)
              </li>
              <li className="flex items-center gap-2 text-xs text-white/75">
                <span className="inline-block h-2 w-2 rounded-full bg-white/25" />
                Sin alcance ({formatNumber(m.populationUnreachable)} hab)
              </li>
            </>
          )}
          <li className="flex items-center gap-2 text-xs text-white/75">
            <span className="inline-block h-2.5 w-3.5 [clip-path:polygon(50%_0,100%_100%,0_100%)] bg-white/50" />
            Antena candidata (criterio territorial)
          </li>
          <li className="flex items-center gap-2 text-xs text-white/75">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-signal-hot shadow-[0_0_8px_2px_var(--signal)]" />
            Antena de la solución (k = {m.k})
          </li>
          <li className="flex items-center gap-2 text-xs text-white/75">
            <span
              className="inline-block h-0.5 w-4"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(90deg, currentColor 0 3px, transparent 3px 6px)",
              }}
            />
            Enlace de la red conectada
          </li>
          <li className="flex items-center gap-2 text-xs text-white/75">
            <span className="relative inline-block h-3 w-3">
              <span className="absolute inset-0 rounded-full border border-signal/70" />
              <span className="absolute inset-0 scale-150 rounded-full border border-signal/30" />
            </span>
            Alcance nominal ρ(a) con LOS
          </li>
        </ul>
      </div>
      </div>

      {/* ── resultados del motor exacto (paso final, fuera de la columna) ── */}
      <AnimatePresence>
        {showSolution && (
          <motion.div
            key="engine-results"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="pointer-events-auto absolute right-4 top-16 w-[min(92vw,300px)] rounded-lg border border-white/10 bg-night-2/95 p-4 backdrop-blur-sm"
            role="status"
            aria-label="Resultados del motor exacto"
          >
            <p
              className="text-[10px] tracking-[0.2em] text-signal"
              style={{ fontFamily: "var(--font-carto)" }}
            >
              MOTOR EXACTO · EXACT_CONNECTED
            </p>
            <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
              <div>
                <dt className="text-white/45">Población cubierta</dt>
                <dd className="mt-0.5 text-base text-signal-hot">
                  {formatNumber(m.populationCovered)}
                </dd>
              </div>
              <div>
                <dt className="text-white/45">Cobertura</dt>
                <dd className="mt-0.5 text-base text-signal-hot">
                  {m.coveragePct.toFixed(1).replace(".", ",")} %
                </dd>
              </div>
              <div>
                <dt className="text-white/45">Antenas</dt>
                <dd className="mt-0.5 text-sm text-white/85">
                  {m.k} de {m.numCandidates} candidatas
                </dd>
              </div>
              <div>
                <dt className="text-white/45">Red conectada</dt>
                <dd className="mt-0.5 text-sm text-white/85">Sí · un componente</dd>
              </div>
              <div className="col-span-2 border-t border-white/10 pt-2">
                <dt className="text-white/45">Dónde queda la población cubierta</dt>
                <dd className="mt-0.5 text-sm text-white/85">
                  {formatNumber(m.byStatus.covered)} de {formatNumber(m.numDemandNodes)} localidades
                  brillantes en el mapa
                </dd>
              </div>
              <div>
                <dt className="text-white/45">Alcanzable no cubierta</dt>
                <dd className="mt-0.5 text-sm text-white/70">
                  {formatNumber(m.populationReachable)} hab
                </dd>
              </div>
              <div>
                <dt className="text-white/45">Sin alcance</dt>
                <dd className="mt-0.5 text-sm text-white/70">
                  {formatNumber(m.populationUnreachable)} hab
                </dd>
              </div>
            </dl>
            {m.evaluations != null && (
              <p className="mt-2 border-t border-white/10 pt-2 text-[10px] leading-relaxed text-white/40">
                {formatNumber(m.evaluations)} evaluaciones ·{" "}
                {m.runtimeSeconds != null
                  ? `${m.runtimeSeconds.toFixed(1).replace(".", ",")} s de cómputo`
                  : "cómputo exacto"}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── panel de restricciones (flyout junto a la columna) ── */}
      <AnimatePresence>
        {showRestrictions && (
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="thin-scroll pointer-events-auto absolute bottom-4 left-4 top-4 w-[min(92vw,340px)] overflow-y-auto rounded-lg border border-white/10 bg-night-2/95 p-4 backdrop-blur-sm lg:left-[352px]"
            role="complementary"
            aria-label="Restricciones aplicadas por el modelo"
          >
            <div className="mb-2 flex items-center justify-between">
              <p
                className="text-xs uppercase tracking-[0.18em] text-signal"
                style={{ fontFamily: "var(--font-carto)" }}
              >
                Restricciones aplicadas
              </p>
              <button
                onClick={() => setShowRestrictions(false)}
                aria-label="Cerrar restricciones"
                className="map-focus rounded p-1 text-white/60 hover:bg-white/10 hover:text-white"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
            <ul className="space-y-3">
              {bundle.restrictions.map((r) => (
                <li key={r.title} className="border-l-2 border-signal/50 pl-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-medium text-white/90">{r.title}</p>
                    <span
                      className="shrink-0 rounded border border-signal/30 px-1.5 py-0.5 text-[10px] text-signal"
                      style={{ fontFamily: "var(--font-carto)" }}
                    >
                      {r.value}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs leading-relaxed text-white/60">
                    {r.body}
                  </p>
                  <p
                    className="mt-1 rounded bg-white/5 px-2 py-1 text-[11px] text-white/50"
                    style={{ fontFamily: "var(--font-carto)" }}
                  >
                    {r.count}
                  </p>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── volver al atlas (superior derecho) ── */}
      <Button
        onClick={onExit}
        variant="outline"
        size="sm"
        className="map-focus pointer-events-auto absolute right-4 top-4 border-white/20 bg-night-2/90 text-white backdrop-blur-sm hover:bg-white/10 hover:text-white"
      >
        <X className="h-4 w-4" aria-hidden /> Volver al atlas
      </Button>
    </motion.div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  FlaskConical,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  buildLabTimeline,
  LAB_INSTANCE,
  labNumber,
  LAB_K_OPTIONS,
  labPct,
  type LabK,
  type LabStep,
} from "@/lib/didactic";

type AlgorithmLabProps = {
  onExit: () => void;
};

const BADGE: Record<LabStep["kind"], { label: string; className: string }> = {
  intro: { label: "El modelo", className: "bg-cobalt text-white" },
  root: { label: "Raíz ESU", className: "bg-signal/20 text-signal" },
  enter: { label: "Extensión", className: "bg-signal/20 text-signal" },
  evaluate: { label: "Evaluación", className: "bg-white/10 text-white" },
  prune: { label: "Poda", className: "bg-[#7a2a20] text-[#ffc9c0]" },
  exit: { label: "Retroceso", className: "bg-white/10 text-white/70" },
  solution: { label: "Solución exacta", className: "bg-signal text-cobalt" },
  greedy: { label: "Baseline goloso", className: "bg-signal-deep/30 text-signal" },
  outro: { label: "Contraste", className: "bg-cobalt text-white" },
};

const MILESTONE_KINDS: LabStep["kind"][] = ["solution", "greedy", "outro"];

export function AlgorithmLab({ onExit }: AlgorithmLabProps) {
  const [k, setK] = useState<LabK>(3);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);

  const { steps, stats } = useMemo(() => buildLabTimeline(k), [k]);
  const step = steps[Math.min(idx, steps.length - 1)];
  const atEnd = idx >= steps.length - 1;

  // cambio de k: reinicia el recorrido en el mismo handler (sin efecto)
  const changeK = (option: LabK) => {
    setK(option);
    setIdx(0);
    setPlaying(false);
  };

  // reproducción automática: cada tick avanza y se detiene al llegar al final
  useEffect(() => {
    if (!playing || atEnd) return;
    const t = window.setTimeout(() => {
      if (idx >= steps.length - 2) setPlaying(false);
      setIdx((i) => Math.min(i + 1, steps.length - 1));
    }, 1400);
    return () => window.clearTimeout(t);
  }, [playing, idx, atEnd, steps.length]);

  // el historial sigue el paso activo
  useEffect(() => {
    const el = historyRef.current?.querySelector<HTMLElement>(`[data-step="${idx}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [idx]);

  const nextMilestone = () => {
    for (let i = idx + 1; i < steps.length; i++) {
      const s = steps[i];
      if (MILESTONE_KINDS.includes(s.kind) || (s.kind === "evaluate" && s.improved) || s.kind === "prune") {
        setIdx(i);
        return;
      }
    }
    setIdx(steps.length - 1);
  };

  const S = new Set(step.S);
  const covered = new Set(step.covered);
  const bestSet = new Set(step.bestS);
  const inExt = new Set(step.ext);
  const inNexcl = new Set(step.nexcl);
  const isPrune = step.kind === "prune";

  const linkPairs = useMemo(
    () =>
      LAB_INSTANCE.candidates.flatMap((c) =>
        c.neighbors.filter((n) => n > c.id).map((n) => [c.id, n] as const),
      ),
    [],
  );

  return (
    <div className="flex min-h-screen flex-col bg-night text-white">
      {/* cabecera */}
      <header className="sticky top-0 z-20 border-b border-white/10 bg-night-2/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Button
              onClick={onExit}
              variant="outline"
              size="sm"
              className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden /> Inicio
            </Button>
            <div className="leading-tight">
              <h1 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em]">
                <FlaskConical className="h-4 w-4 text-signal" aria-hidden />
                Laboratorio del algoritmo
              </h1>
              <p className="text-[11px] text-white/55" style={{ fontFamily: "var(--font-carto)" }}>
                ESU + unión incremental + cota de prefijos, paso a paso
              </p>
            </div>
          </div>
          {/* selector de k */}
          <div className="flex items-center gap-2" role="group" aria-label="Presupuesto de antenas k">
            <span
              className="hidden text-[11px] uppercase tracking-[0.18em] text-white/50 sm:block"
              style={{ fontFamily: "var(--font-carto)" }}
            >
              Antenas k =
            </span>
            {LAB_K_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => changeK(option)}
                aria-pressed={k === option}
                className={`h-9 w-11 border font-medium transition-colors ${
                  k === option
                    ? "border-signal bg-signal text-cobalt"
                    : "border-white/25 bg-transparent text-white/70 hover:bg-white/10 hover:text-white"
                }`}
                style={{ fontFamily: "var(--font-carto)" }}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
          {/* ── mapa de la instancia ── */}
          <section aria-label="Mapa de la instancia didáctica" className="flex flex-col gap-3">
            <div className="relative overflow-hidden rounded-md border border-white/10 bg-night-2">
              <svg
                viewBox="0 0 560 430"
                className="block w-full"
                role="img"
                aria-label={`Estado del paso ${idx + 1}: S = ${step.S.join(", ") || "vacío"}`}
              >
                {/* retícula tenue */}
                <defs>
                  <pattern id="lab-grid" width="28" height="28" patternUnits="userSpaceOnUse">
                    <path d="M 28 0 L 0 0 0 28" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                  </pattern>
                </defs>
                <rect width="560" height="430" fill="url(#lab-grid)" />

                {/* círculos de cobertura */}
                {LAB_INSTANCE.candidates.map((c) => (
                  <circle
                    key={`cov-${c.id}`}
                    cx={c.x}
                    cy={c.y}
                    r={56}
                    className="transition-all duration-500"
                    fill={S.has(c.id) ? "rgba(245, 241, 226, 0.05)" : "transparent"}
                    stroke={S.has(c.id) ? "rgba(245, 241, 226, 0.45)" : "rgba(255,255,255,0.09)"}
                    strokeDasharray={S.has(c.id) ? undefined : "3 4"}
                    strokeWidth={S.has(c.id) ? 1.4 : 1}
                  />
                ))}

                {/* enlaces G_conn */}
                {linkPairs.map(([a, b]) => {
                  const ca = LAB_INSTANCE.candidates.find((c) => c.id === a)!;
                  const cb = LAB_INSTANCE.candidates.find((c) => c.id === b)!;
                  const active = S.has(a) && S.has(b);
                  return (
                    <line
                      key={`link-${a}-${b}`}
                      x1={ca.x}
                      y1={ca.y}
                      x2={cb.x}
                      y2={cb.y}
                      className="transition-all duration-500"
                      stroke={active ? "rgba(245, 241, 226, 0.95)" : "rgba(255,255,255,0.22)"}
                      strokeWidth={active ? 2.6 : 1.2}
                      strokeDasharray={active ? undefined : "5 4"}
                    />
                  );
                })}

                {/* localidades */}
                {LAB_INSTANCE.localities.map((l) => {
                  const r = 3.4 + 3.4 * Math.min(1, Math.sqrt(l.pop) / 11);
                  const lit = covered.has(l.id);
                  return (
                    <g key={l.id}>
                      {lit && (
                        <circle cx={l.x} cy={l.y} r={r + 3.5} fill="rgba(245,241,226,0.22)" className="transition-all duration-500" />
                      )}
                      <circle
                        cx={l.x}
                        cy={l.y}
                        r={r}
                        className="transition-all duration-500"
                        fill={lit ? "#f5f1e2" : "rgba(255,255,255,0.22)"}
                        stroke="rgba(12,14,42,0.6)"
                        strokeWidth={0.8}
                      >
                        <title>{`${l.name} · ${labNumber(l.pop)} hab${lit ? " · cubierta por S" : ""}`}</title>
                      </circle>
                    </g>
                  );
                })}

                {/* candidatos */}
                {LAB_INSTANCE.candidates.map((c) => {
                  const chosen = S.has(c.id);
                  const isExt = inExt.has(c.id) || inNexcl.has(c.id);
                  const isBest = bestSet.has(c.id);
                  const popCubre = c.covers.reduce(
                    (s, d) => s + (LAB_INSTANCE.localities.find((l) => l.id === d)?.pop ?? 0),
                    0,
                  );
                  return (
                    <g key={c.id} transform={`translate(${c.x}, ${c.y})`}>
                      {isExt && !chosen && (
                        <rect
                          x={-19}
                          y={-19}
                          width={38}
                          height={38}
                          fill="none"
                          stroke="rgba(245,241,226,0.55)"
                          strokeWidth={1.2}
                          strokeDasharray="4 3"
                          rx={5}
                        >
                          <title>{`${c.name} · en la lista de extensión`}</title>
                        </rect>
                      )}
                      <rect
                        width={30}
                        height={30}
                        x={-15}
                        y={-15}
                        rx={4}
                        className="transition-all duration-500"
                        fill={chosen ? "var(--cobalt)" : "rgba(34, 38, 74, 0.9)"}
                        stroke={chosen ? "#f5f1e2" : isBest ? "rgba(245,241,226,0.65)" : "rgba(255,255,255,0.3)"}
                        strokeWidth={chosen ? 1.8 : 1.2}
                      >
                        <title>{`${c.name} · cubre ${labNumber(popCubre)} hab${c.neighbors.length ? "" : " · sin enlaces en G_conn"}`}</title>
                      </rect>
                      <text
                        y={1}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize={13}
                        fontWeight={600}
                        fill={chosen ? "#f5f1e2" : "rgba(255,255,255,0.85)"}
                        style={{ fontFamily: "var(--font-carto)" }}
                        pointerEvents="none"
                      >
                        {c.id}
                      </text>
                      {isBest && !chosen && (
                        <text y={-21} textAnchor="middle" fontSize={11} fill="rgba(245,241,226,0.8)" pointerEvents="none">
                          ★
                        </text>
                      )}
                      {isPrune &&
                        S.has(c.id) && (
                          <g stroke="#ff8a7a" strokeWidth={2.2} strokeLinecap="round">
                            <line x1={-11} y1={-11} x2={11} y2={11} />
                            <line x1={11} y1={-11} x2={-11} y2={11} />
                          </g>
                        )}
                      <text
                        y={26}
                        textAnchor="middle"
                        fontSize={7.5}
                        fill="rgba(255,255,255,0.45)"
                        pointerEvents="none"
                        style={{ fontFamily: "var(--font-carto)" }}
                      >
                        {c.name.toUpperCase()}
                      </text>
                    </g>
                  );
                })}
              </svg>

              {/* leyenda del mapa */}
              <div
                className="pointer-events-none absolute bottom-2 left-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-white/60"
                style={{ fontFamily: "var(--font-carto)" }}
              >
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 border border-signal bg-cobalt" aria-hidden /> elegida (S)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 border border-dashed border-signal/70" aria-hidden /> extensión
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-signal-hot" aria-hidden /> localidad cubierta
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-white/25" aria-hidden /> sin cubrir
                </span>
                <span className="flex items-center gap-1.5">★ mejor solución</span>
              </div>
            </div>

            {/* lectura de estado */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StateCell
                label="f(S) población única"
                value={labNumber(step.f)}
                hint={labPct(step.f)}
                highlight={step.improved}
              />
              <StateCell
                label="Mejor f*"
                value={labNumber(step.bestF)}
                hint={step.bestS.length ? `{ ${step.bestS.join(", ")} }` : "∅"}
              />
              <StateCell label="Evaluaciones" value={labNumber(step.evals)} hint={`fuerza bruta: ${labNumber(stats.combos)}`} />
              <StateCell
                label="Cota disponible"
                value={step.bound === null ? "—" : labNumber(step.bound)}
                hint={step.bound === null ? "sólo en la búsqueda" : "prefix[k − |S|]"}
              />
            </div>
          </section>

          {/* ── narración y controles ── */}
          <section aria-label="Narración paso a paso" className="flex flex-col gap-4">
            <motion.div
              key={`${k}-${idx}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="rounded-md border border-white/10 bg-night-2 p-5"
            >
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={`px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] ${BADGE[step.kind].className}`}
                  style={{ fontFamily: "var(--font-carto)" }}
                >
                  {BADGE[step.kind].label}
                </span>
                {step.improved && (
                  <span
                    className="bg-signal px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-cobalt"
                    style={{ fontFamily: "var(--font-carto)" }}
                  >
                    nuevo mejor
                  </span>
                )}
                <span className="ml-auto text-[11px] text-white/45" style={{ fontFamily: "var(--font-carto)" }}>
                  paso {idx + 1} / {steps.length}
                </span>
              </div>
              <h2 className="mt-3 text-xl font-light leading-snug text-signal-hot" style={{ fontFamily: "var(--font-display)" }}>
                {step.title}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-white/75">{step.note}</p>

              {(step.S.length > 0 || step.ext.length > 0) && (
                <dl className="mt-4 grid gap-2 border-t border-white/10 pt-3 text-xs" style={{ fontFamily: "var(--font-carto)" }}>
                  <div className="flex flex-wrap items-baseline gap-2">
                    <dt className="text-white/45 uppercase tracking-[0.14em]">S</dt>
                    <dd className="text-signal">{step.S.length ? `{ ${step.S.join(", ")} }` : "∅"}</dd>
                    {step.ext.length > 0 && (
                      <>
                        <dt className="ml-3 text-white/45 uppercase tracking-[0.14em]">extensión</dt>
                        <dd className="text-white/70">[{step.ext.join(", ")}]</dd>
                      </>
                    )}
                  </div>
                </dl>
              )}
            </motion.div>

            {/* controles */}
            <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Controles de reproducción">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIdx(0);
                  setPlaying(false);
                }}
                className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
              >
                <RotateCcw className="h-4 w-4" aria-hidden />
                <span className="sr-only sm:not-sr-only">Reiniciar</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setPlaying(false);
                  setIdx((i) => Math.max(0, i - 1));
                }}
                disabled={idx === 0}
                className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
                <span className="sr-only sm:not-sr-only">Anterior</span>
              </Button>
              <Button
                size="sm"
                onClick={() => setPlaying((p) => !p)}
                disabled={atEnd && !playing}
                className="bg-signal text-cobalt hover:bg-signal-hot"
              >
                {playing ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
                <span className="sr-only sm:not-sr-only">{playing ? "Pausa" : "Reproducir"}</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setPlaying(false);
                  setIdx((i) => Math.min(i + 1, steps.length - 1));
                }}
                disabled={atEnd}
                className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
              >
                <span className="sr-only sm:not-sr-only">Siguiente</span>
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setPlaying(false);
                  nextMilestone();
                }}
                disabled={atEnd}
                className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
              >
                <SkipForward className="h-4 w-4" aria-hidden />
                <span className="sr-only sm:not-sr-only">Siguiente hito</span>
              </Button>
            </div>

            {/* historial */}
            <div className="rounded-md border border-white/10 bg-night-2/60">
              <p
                className="border-b border-white/10 px-4 py-2 text-[10px] uppercase tracking-[0.18em] text-white/45"
                style={{ fontFamily: "var(--font-carto)" }}
              >
                Recorrido de la búsqueda
              </p>
              <div
                ref={historyRef}
                className="max-h-52 overflow-y-auto p-2 [scrollbar-color:rgba(255,255,255,0.3)_transparent] [scrollbar-width:thin]"
              >
                <ol aria-label="Historial de pasos">
                  {steps.map((s, i) => (
                    <li key={i}>
                      <button
                        type="button"
                        data-step={i}
                        onClick={() => {
                          setPlaying(false);
                          setIdx(i);
                        }}
                        aria-current={i === idx ? "step" : undefined}
                        className={`flex w-full items-baseline gap-2 px-2 py-1.5 text-left text-xs transition-colors ${
                          i === idx
                            ? "bg-white/10 text-signal-hot"
                            : i < idx
                              ? "text-white/60 hover:bg-white/5"
                              : "text-white/35 hover:bg-white/5"
                        }`}
                      >
                        <span className="w-6 shrink-0 text-right text-[10px] text-white/35" style={{ fontFamily: "var(--font-carto)" }}>
                          {i + 1}
                        </span>
                        <span className="flex-1 truncate">{s.title}</span>
                        {(s.kind === "prune" || s.improved) && (
                          <span
                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${s.kind === "prune" ? "bg-[#ff8a7a]" : "bg-signal"}`}
                            aria-hidden
                          />
                        )}
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* pie pegado al fondo */}
      <footer className="mt-auto border-t border-white/10 bg-pine">
        <div className="mx-auto flex max-w-7xl flex-wrap items-baseline justify-between gap-2 px-4 py-4 sm:px-6">
          <p className="max-w-3xl text-xs leading-relaxed text-white/55">
            Instancia sintética «Valle Escondido» para aprender — sin resultados inventados de pilotos reales.
            El motor reproduce fielmente la especificación: enumeración ESU canónica (I1), unión incremental con
            deshacer (I2), cota de prefijos con poda estricta (I3) y desempate lexicográfico (I4).
          </p>
          <p className="text-[11px] uppercase tracking-[0.2em] text-white/40" style={{ fontFamily: "var(--font-carto)" }}>
            Red Austral · Laboratorio didáctico
          </p>
        </div>
      </footer>
    </div>
  );
}

function StateCell({
  label,
  value,
  hint,
  highlight,
}: {
  label: string;
  value: string;
  hint?: string;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-md border bg-night-2/60 px-3 py-2.5 ${highlight ? "border-signal/60" : "border-white/10"}`}>
      <p className="text-[10px] uppercase tracking-[0.14em] text-white/45" style={{ fontFamily: "var(--font-carto)" }}>
        {label}
      </p>
      <motion.p
        key={value}
        initial={{ opacity: 0.4 }}
        animate={{ opacity: 1 }}
        className={`mt-1 text-lg font-medium tabular-nums ${highlight ? "text-signal-hot" : "text-white"}`}
        style={{ fontFamily: "var(--font-carto)" }}
      >
        {value}
      </motion.p>
      {hint && (
        <p className="text-[10px] text-white/40" style={{ fontFamily: "var(--font-carto)" }}>
          {hint}
        </p>
      )}
    </div>
  );
}

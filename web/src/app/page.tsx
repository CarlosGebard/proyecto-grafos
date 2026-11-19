"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, MousePointerClick } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ChileMap,
  type MapZoomApi,
} from "@/components/atlas/chile-map";
import { LocalitySheet } from "@/components/atlas/locality-sheet";
import { SimulationView } from "@/components/atlas/simulation-view";
import { AlgorithmLab } from "@/components/learn/algorithm-lab";
import { Landing } from "@/components/landing";
import {
  PILOTS,
  type Pilot,
  type PilotId,
  type SimulationBundle,
} from "@/lib/pilots";

type View = "landing" | "atlas" | "learn";
type Phase = "atlas" | "flying" | "sim";

export default function Home() {
  const [view, setView] = useState<View>("landing");
  const [selected, setSelected] = useState<Pilot | null>(null);
  const [active, setActive] = useState<Pilot | null>(null);
  const [phase, setPhase] = useState<Phase>("atlas");
  const [bundles, setBundles] = useState<Partial<Record<PilotId, SimulationBundle>>>({});
  const [simStep, setSimStep] = useState(0);
  const [mapZoom, setMapZoom] = useState<number | null>(null);
  const zoomApiRef = useRef<MapZoomApi>(null);

  // cargar los paquetes de simulación (artefactos versionados de la corrida)
  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      PILOTS.map((p) =>
        fetch(`/data/pilots/${p.id}.json`)
          .then((r) => r.json() as Promise<SimulationBundle>)
          .catch(() => null),
      ),
    ).then((list) => {
      if (cancelled) return;
      const next: Partial<Record<PilotId, SimulationBundle>> = {};
      for (const b of list) {
        if (b?.id) next[b.id as PilotId] = b;
      }
      setBundles(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // puntos de localidades por piloto (capa de señal del atlas)
  const dots = useMemo(() => {
    const out: Partial<Record<PilotId, SimulationBundle["localities"]>> = {};
    let has = false;
    for (const p of PILOTS) {
      const b = bundles[p.id];
      if (b) {
        out[p.id] = b.localities;
        has = true;
      }
    }
    return has ? out : null;
  }, [bundles]);

  const activeBundle = active ? bundles[active.id] ?? null : null;

  // al salir del atlas, restaurar todo
  const backToLanding = useCallback(() => {
    setView("landing");
    setSelected(null);
    setActive(null);
    setPhase("atlas");
    setSimStep(0);
    setMapZoom(null);
  }, []);

  // entrar a la simulación: el mapa vuela a la ventana de estudio (transición única)
  const startSimulation = useCallback(
    (pilot: Pilot) => {
      if (!bundles[pilot.id]) return;
      setSelected(null);
      setActive(pilot);
      setSimStep(0);
      setPhase("flying");
      window.setTimeout(() => setPhase("sim"), 2000);
    },
    [bundles],
  );

  const exitSimulation = useCallback(() => {
    setPhase("atlas");
    setActive(null);
    setSimStep(0);
    setMapZoom(null);
  }, []);

  // tecla Escape cierra la carta (solo en el atlas)
  useEffect(() => {
    if (view !== "atlas") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && phase === "atlas") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, phase]);

  return (
    <div className="min-h-screen bg-paper text-ink">
      {view === "landing" && (
        <div className="flex min-h-screen flex-col">
          <Landing onEnterAtlas={() => setView("atlas")} onEnterLab={() => setView("learn")} />
        </div>
      )}

      {view === "learn" && (
        <div className="min-h-screen bg-night">
          <AlgorithmLab onExit={backToLanding} />
        </div>
      )}

      {view === "atlas" && (
        <div className="fixed inset-0 z-10 overflow-hidden bg-night">
          <ChileMap
            selectedId={selected?.id ?? null}
            onSelect={setSelected}
            focus={
              active
                ? {
                    center: active.center,
                    zoom: active.focusZoom,
                    bounds: activeBundle?.bounds,
                  }
                : null
            }
            dimmed={selected !== null}
            dots={dots}
            simPilot={phase === "atlas" ? null : active}
            simBundle={phase === "atlas" ? null : activeBundle}
            simStep={simStep}
            zoomApi={zoomApiRef}
            onZoomChange={setMapZoom}
          />

          {/* barra superior del atlas */}
          <AnimatePresence>
            {phase === "atlas" && !selected && (
              <motion.div
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
                className="absolute left-4 top-4 z-20 flex items-start gap-3"
              >
                <Button
                  onClick={backToLanding}
                  variant="outline"
                  size="sm"
                  className="map-focus border-white/20 bg-night-2/90 text-white backdrop-blur-sm hover:bg-white/10 hover:text-white"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden /> Inicio
                </Button>
                <p className="flex max-w-[260px] items-center gap-2 rounded-md border border-white/10 bg-night-2/80 px-3 py-2 text-xs text-white/70 backdrop-blur-sm">
                  <MousePointerClick className="h-3.5 w-3.5 shrink-0 text-signal" aria-hidden />
                  Haz click en un piloto para abrir su carta social.
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* carta lateral */}
          <AnimatePresence>
            {selected && phase === "atlas" && (
              <LocalitySheet
                pilot={selected}
                bundle={bundles[selected.id]}
                onClose={() => setSelected(null)}
                onSimulate={startSimulation}
              />
            )}
          </AnimatePresence>

          {/* vista de simulación: paneles sobre el mapa Leaflet real */}
          <AnimatePresence>
            {phase !== "atlas" && active && activeBundle && (
              <SimulationView
                key={active.id}
                pilot={active}
                bundle={activeBundle}
                onExit={exitSimulation}
                onStepChange={setSimStep}
                zoomApi={zoomApiRef}
                zoomLevel={mapZoom}
              />
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  PILOTS,
  formatNumber,
  type Pilot,
  type PilotId,
  type SimulationBundle,
} from "@/lib/pilots";

export type MapFocus = {
  center: [number, number];
  zoom: number;
  /** Ventana de estudio [oeste, sur, este, norte]: vuela a encuadrar el área. */
  bounds?: [number, number, number, number];
} | null;

export type MapZoomApi = {
  zoomIn: () => void;
  zoomOut: () => void;
} | null;

type ChileMapProps = {
  selectedId: string | null;
  onSelect: (pilot: Pilot) => void;
  focus: MapFocus;
  dimmed: boolean;
  /** Puntos de localidades por piloto: [lon, lat, población, estado] —
   *  estado: 0 sin alcance · 1 alcanzable · 2 cubierta (motor exacto) */
  dots: Partial<Record<PilotId, SimulationBundle["localities"]>> | null;
  /** Piloto en modo simulación (también durante el vuelo de aproximación). */
  simPilot: Pilot | null;
  /** Paquete de simulación activo: define las capas a renderizar. */
  simBundle: SimulationBundle | null;
  /** Paso de la secuencia: 0 localidades · 1 candidatas · 2 cobertura · 3 solución. */
  simStep: number;
  /** API de zoom del mapa para los controles del panel de simulación. */
  zoomApi: { current: MapZoomApi };
  onZoomChange?: (zoom: number) => void;
};

/** Anillo en formato [lat, lng] para Leaflet. */
const ring = (pts: [number, number][]): [number, number][] =>
  pts.map(([lon, lat]) => [lat, lon]);

/** Vista completa del país. */
const OVERVIEW_BOUNDS: Leaflet.LatLngBoundsExpression = [
  [-57.0, -77.0],
  [-17.0, -66.0],
];

const TILE_URL = "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png";

/* metadatos de las capas de simulación */
type LocMeta = {
  marker: Leaflet.CircleMarker;
  pop: number;
  status: number;
  r: number;
};

type CandMeta = {
  marker: Leaflet.Marker;
  rho: Leaflet.Circle;
  sel: boolean;
};

type SimData = {
  bundle: SimulationBundle;
  canvas: Leaflet.Canvas;
  gVeil: Leaflet.LayerGroup;
  gLoc: Leaflet.LayerGroup;
  gHalo: Leaflet.LayerGroup;
  gCand: Leaflet.LayerGroup;
  gRho: Leaflet.LayerGroup;
  gCov: Leaflet.LayerGroup;
  gCovSel: Leaflet.LayerGroup;
  gConn: Leaflet.LayerGroup;
  locs: LocMeta[];
  cands: CandMeta[];
};

/** Re composición tras cambios masivos de capas: Chromium a veces presenta
 *  marcos obsoletos del canvas/svg (texturas GPU viejas). Forzar el
 *  re-composite promoviendo el CONTENEDOR del mapa (una única capa GPU):
 *  teselas y datos quedan en la misma capa y no pueden desincronizarse
 *  entre sí. Promover canvas/svg individuales con translateZ desincronizaba
 *  los puntos respecto de las teselas durante el arrastre (los puntos
 *  "se movían de lugar y luego se re acomodaban" al soltar). */
function recompositeOverlay(map: Leaflet.Map) {
  const container = map.getContainer();
  container.style.transform = "translateZ(0)";
  window.setTimeout(() => {
    container.style.transform = "";
  }, 250);
}

export function ChileMap({
  selectedId,
  onSelect,
  focus,
  dimmed,
  dots,
  simPilot,
  simBundle,
  simStep,
  zoomApi,
  onZoomChange,
}: ChileMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const leafletRef = useRef<typeof Leaflet | null>(null);
  const markersRef = useRef<Record<string, Leaflet.Marker>>({});
  /** capa de atlas (marcadores de pilotos + puntos de localidades) */
  const atlasLayerRef = useRef<Leaflet.LayerGroup | null>(null);
  const simDataRef = useRef<SimData | null>(null);
  const restrictTokenRef = useRef(0);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onZoomRef = useRef(onZoomChange);
  onZoomRef.current = onZoomChange;
  const firstFocusRun = useRef(true);
  /** true cuando el mapa ya está inicializado (evita la carrera con la carga de datos) */
  const [mapReady, setMapReady] = useState(false);

  /* ── inicialización del mapa ─────────────────────────────────── */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const mod = await import("leaflet");
      const L = ((mod.default ?? mod) as typeof Leaflet) ?? mod;
      if (cancelled || !containerRef.current || mapRef.current) return;
      leafletRef.current = L;

      const styles = getComputedStyle(document.documentElement);
      const night = styles.getPropertyValue("--night").trim() || "#0c0e2a";
      const signal = styles.getPropertyValue("--signal").trim() || "#eee9d8";

      const map = L.map(containerRef.current, {
        zoomControl: false,
        attributionControl: false,
        minZoom: 4,
        maxZoom: 17,
        maxBounds: OVERVIEW_BOUNDS,
        maxBoundsViscosity: 1,
        zoomSnap: 0.25,
        scrollWheelZoom: true,
      });
      mapRef.current = map;
      map.fitBounds(OVERVIEW_BOUNDS, { animate: false });

      /* teselas topográficas (estilo tipo Tracestrack Topo) */
      L.tileLayer(TILE_URL, {
        subdomains: "abc",
        maxZoom: 17,
        className: "atlas-tiles",
      }).addTo(map);

      /* capa de atlas: marcadores de pilotos + puntos de localidades.
         Se oculta completa durante la simulación para dejar sus capas. */
      atlasLayerRef.current = L.layerGroup().addTo(map);

      /* pane propio entre teselas (200) y datos (400): velo nocturno de la
         simulación — oscurece el mapa base SIN apagar los datos */
      const veilPane = map.createPane("simVeilPane");
      veilPane.style.zIndex = "300";
      veilPane.style.pointerEvents = "none";

      /* silueta de Chile (Natural Earth, con islas): máscara + contorno.
         Todo el mundo queda en "noche", salvo Chile (agujeros de la máscara). */
      const chile = (await fetch("/data/chile.json").then((r) => r.json())) as {
        geometry: {
          type: "Polygon" | "MultiPolygon";
          coordinates: [number, number][][][] | [number, number][][][][];
        };
      };
      const polygons: [number, number][][][][] =
        chile.geometry.type === "Polygon"
          ? [chile.geometry.coordinates as unknown as [number, number][][][]]
          : (chile.geometry.coordinates as [number, number][][][][]);
      const WORLD_RING: [number, number][] = [
        [-85, -180],
        [-85, 180],
        [85, 180],
        [85, -180],
      ];
      const chileRings = polygons.flatMap((poly) =>
        poly.map((r) => ring(r as unknown as [number, number][])),
      );
      L.polygon([WORLD_RING, ...chileRings], {
        stroke: false,
        fillColor: night,
        fillOpacity: 1,
        interactive: false,
      }).addTo(map);
      for (const rings of polygons) {
        for (const r of rings as unknown as [number, number][][]) {
          L.polygon(ring(r), {
            fill: false,
            color: signal,
            weight: 1.2,
            opacity: 0.55,
            interactive: false,
          }).addTo(map);
        }
      }

      /* puntos de interés pulsantes (pilotos) */
      for (const pilot of PILOTS) {
        const marker = L.marker([pilot.center[1], pilot.center[0]], {
          icon: L.divIcon({
            className: "atlas-marker-outer",
            html: `<div class="atlas-marker ${pilot.labelSide === "abajo" ? "side-abajo" : ""}" data-id="${pilot.id}"><span class="atlas-marker-halo"></span><span class="atlas-marker-core"></span><span class="atlas-marker-label">${pilot.name}</span></div>`,
            iconSize: [22, 22],
            iconAnchor: [11, 11],
          }),
          keyboard: true,
          title: pilot.name,
          alt: `${pilot.name}: abrir carta de impacto social`,
        });
        marker.on("click", () => onSelectRef.current(pilot));
        marker.addTo(atlasLayerRef.current);
        markersRef.current[pilot.id] = marker;
      }

      zoomApi.current = {
        zoomIn: () => mapRef.current?.zoomIn(),
        zoomOut: () => mapRef.current?.zoomOut(),
      };
      map.on("zoomend", () => onZoomRef.current?.(map.getZoom()));

      setMapReady(true);
    })();

    return () => {
      cancelled = true;
      zoomApi.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  /* ── vuelo al punto / regreso a la vista general ─────────────── */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (firstFocusRun.current) {
      firstFocusRun.current = false;
      if (!focus) return;
    }
    if (focus) {
      if (focus.bounds) {
        const [w, s, e, n] = focus.bounds;
        map.flyToBounds(
          [
            [s, w],
            [n, e],
          ],
          { duration: 2.0, easeLinearity: 0.18 },
        );
      } else {
        map.flyTo([focus.center[1], focus.center[0]], focus.zoom, {
          duration: 1.9,
          easeLinearity: 0.18,
        });
      }
    } else {
      /* restaurar límites del atlas ANTES de volar de regreso: si el vuelo
         parte con el minZoom de la simulación (p. ej. 11), queda clamp */
      map.setMinZoom(4);
      map.setMaxBounds(OVERVIEW_BOUNDS);
      map.flyToBounds(OVERVIEW_BOUNDS, { duration: 1.4 });
    }
  }, [focus]);

  /* ── estado visual del punto seleccionado ────────────────────── */
  useEffect(() => {
    for (const [id, marker] of Object.entries(markersRef.current)) {
      marker
        .getElement()
        ?.querySelector(".atlas-marker")
        ?.classList.toggle("is-selected", id === selectedId);
    }
  }, [selectedId]);

  /* ── puntos de localidades de los pilotos (capa del atlas) ───── */
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const atlas = atlasLayerRef.current;
    if (!L || !map || !atlas) return;
    if (!dots) return;
    const styles = getComputedStyle(document.documentElement);
    const hot = styles.getPropertyValue("--signal-hot").trim() || "#f5f1e2";
    const soft = styles.getPropertyValue("--signal").trim() || "#eee9d8";
    const night = styles.getPropertyValue("--night").trim() || "#0c0e2a";
    for (const points of Object.values(dots)) {
      if (!points) continue;
      for (const [lon, lat, pop, status] of points) {
        const covered = status === 2;
        const reachable = status === 1;
        const radius =
          (covered ? 2.2 : 1.6) + (covered ? 2.8 : 2.0) * Math.min(1, Math.sqrt(pop || 1) / 34);
        L.circleMarker([lat, lon], {
          radius,
          stroke: true,
          color: night,
          weight: covered ? 1.1 : 0.8,
          opacity: 0.55,
          fillColor: covered ? hot : reachable ? soft : "#ffffff",
          fillOpacity: covered ? 0.95 : reachable ? 0.5 : 0.2,
          interactive: false,
        }).addTo(atlas);
      }
    }
  }, [dots, mapReady]);

  /* ── construcción de las capas de simulación (por paquete) ───── */
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;

    /* limpiar capas anteriores */
    const prev = simDataRef.current;
    if (prev) {
      for (const g of [
        prev.gVeil,
        prev.gLoc,
        prev.gHalo,
        prev.gCand,
        prev.gRho,
        prev.gCov,
        prev.gCovSel,
        prev.gConn,
      ]) {
        map.removeLayer(g);
      }
      prev.canvas.remove();
      simDataRef.current = null;
    }
    if (!simBundle) return;

    const styles = getComputedStyle(document.documentElement);
    const night = styles.getPropertyValue("--night").trim() || "#0c0e2a";
    const signal = styles.getPropertyValue("--signal").trim() || "#eee9d8";
    const hot = styles.getPropertyValue("--signal-hot").trim() || "#f5f1e2";

    const candLatlng = (i: number): Leaflet.LatLngExpression => [
      simBundle.candidates[i][1],
      simBundle.candidates[i][0],
    ];
    const locLatlng = (i: number): Leaflet.LatLngExpression => [
      simBundle.localities[i][1],
      simBundle.localities[i][0],
    ];

    /* renderer en canvas: miles de aristas y círculos se rasterizan mejor
       que como elementos SVG (evita el límite de rasterización de paths) */
    const canvas = L.canvas({ padding: 0.3 });

    /* velo nocturno bajo los datos: oscurece las teselas sin apagar la red */
    const gVeil = L.layerGroup();
    L.rectangle(
      [
        [-85, -540],
        [85, 540],
      ],
      {
        pane: "simVeilPane",
        stroke: false,
        fillColor: night,
        fillOpacity: 0.55,
        interactive: false,
      },
    ).addTo(gVeil);

    /* paso 0: localidades (neutras; el estado se revela en el paso 3) */
    const gLoc = L.layerGroup();
    const locs: LocMeta[] = simBundle.localities.map(([lon, lat, pop, status]) => {
      const r = 2.5 + 5 * Math.min(1, Math.sqrt(pop || 1) / 34);
      const marker = L.circleMarker([lat, lon], {
        renderer: canvas,
        radius: r,
        stroke: true,
        color: night,
        weight: 1.1,
        opacity: 0.85,
        fillColor: hot,
        fillOpacity: 0.9,
      });
      marker.bindTooltip(`${formatNumber(pop)} hab`, {
        direction: "top",
        offset: [0, -8],
        className: "sim-tip",
      });
      marker.addTo(gLoc);
      return { marker, pop, status, r };
    });

    /* pasos 1-3: antenas candidatas (triángulo) + alcance nominal ρ(a) */
    const gCand = L.layerGroup();
    const gRho = L.layerGroup();
    const cands: CandMeta[] = simBundle.candidates.map(([lon, lat, radiusM, sel]) => {
      const selected = sel === 1;
      const icon = L.divIcon({
        className: "sim-cand-outer",
        iconSize: [26, 26],
        iconAnchor: [13, 13],
        html: `<div class="sim-cand"><svg viewBox="0 0 26 26"><path class="tri" d="M5 21 L13 6 L21 21"/><path class="tri2" d="M5 21 L13 6 L21 21"/><line class="beam" x1="13" y1="6" x2="13" y2="1"/><circle class="lamp" cx="13" cy="-1.5" r="4.5"/><circle class="lamp-ping" cx="13" cy="-1.5" r="4.5"/></svg></div>`,
      });
      const marker = L.marker([lat, lon], { icon, interactive: false, keyboard: false });
      marker.addTo(gCand);
      const rho = L.circle([lat, lon], {
        renderer: canvas,
        radius: radiusM,
        stroke: true,
        color: signal,
        weight: 1,
        opacity: selected ? 0.5 : 0.28,
        dashArray: selected ? undefined : "3 5",
        fill: false,
        interactive: false,
      });
      rho.addTo(gRho);
      return { marker, rho, sel: selected };
    });

    /* paso 2: aristas de cobertura (candidato → localidad) */
    const gCov = L.layerGroup();
    const gCovSel = L.layerGroup();
    for (const [ci, di] of simBundle.coverageEdges) {
      const line = L.polyline([candLatlng(ci), locLatlng(di)], {
        renderer: canvas,
        stroke: true,
        color: "#ffffff",
        weight: 0.7,
        opacity: 0.18,
        interactive: false,
      });
      if (simBundle.candidates[ci][3] === 1) {
        line.addTo(gCovSel);
        line.setStyle({ color: hot, weight: 1.2, opacity: 0.4 });
      } else {
        line.addTo(gCov);
      }
    }

    /* paso 3: red conectada entre las antenas elegidas */
    const gConn = L.layerGroup();
    for (const [a, b] of simBundle.connEdges) {
      if (simBundle.candidates[a][3] !== 1 || simBundle.candidates[b][3] !== 1) continue;
      L.polyline([candLatlng(a), candLatlng(b)], {
        stroke: true,
        color: hot,
        weight: 2.4,
        opacity: 0.95,
        dashArray: "7 5",
        className: "dash-flow",
        interactive: false,
      }).addTo(gConn);
    }

    /* halos de cobertura: sobre las localidades cubiertas (paso 3) */
    const gHalo = L.layerGroup();
    simBundle.localities.forEach(([lon, lat, pop, status]) => {
      if (status !== 2) return;
      const r = 2.5 + 5 * Math.min(1, Math.sqrt(pop || 1) / 34);
      L.circleMarker([lat, lon], {
        renderer: canvas,
        radius: r + 4,
        stroke: false,
        fillColor: signal,
        fillOpacity: 0.4,
        interactive: false,
      }).addTo(gHalo);
    });

    simDataRef.current = {
      bundle: simBundle,
      canvas,
      gVeil,
      gLoc,
      gHalo,
      gCand,
      gRho,
      gCov,
      gCovSel,
      gConn,
      locs,
      cands,
    };
  }, [simBundle, mapReady]);

  /* ── aplicación del paso de la secuencia + límites del piloto ── */
  useEffect(() => {
    const map = mapRef.current;
    const atlas = atlasLayerRef.current;
    if (!map) return;

    const token = ++restrictTokenRef.current;

    /* fin de la simulación: restaurar atlas y límites del país */
    if (!simPilot || !simBundle) {
      map.setMinZoom(4);
      map.setMaxBounds(OVERVIEW_BOUNDS);
      if (atlas && !map.hasLayer(atlas)) map.addLayer(atlas);
      window.setTimeout(() => {
        if (token === restrictTokenRef.current) recompositeOverlay(map);
      }, 120);
      return;
    }

    /* ocultar la capa del atlas durante la simulación */
    if (atlas && map.hasLayer(atlas)) map.removeLayer(atlas);

    const data = simDataRef.current;
    if (!data || data.bundle !== simBundle) return;

    const styles = getComputedStyle(document.documentElement);
    const hot = styles.getPropertyValue("--signal-hot").trim() || "#f5f1e2";
    const deep = styles.getPropertyValue("--signal-deep").trim() || "#8b8fd4";

    const { gVeil, gLoc, gHalo, gCand, gRho, gCov, gCovSel, gConn, locs, cands } = data;
    const show = (g: Leaflet.LayerGroup, on: boolean) => {
      if (on) g.addTo(map);
      else map.removeLayer(g);
    };

    show(gVeil, true);
    show(gLoc, true);
    show(gCand, simStep >= 1);
    show(gRho, simStep >= 2);
    show(gCov, simStep >= 2);
    show(gCovSel, simStep >= 3);
    show(gConn, simStep >= 3);
    show(gHalo, simStep >= 3);

    /* paso 3: revelar el estado de cobertura de cada localidad */
    for (const { marker, pop, status, r } of locs) {
      const covered = simStep >= 3 && status === 2;
      const reachable = simStep >= 3 && status === 1;
      const unreachable = simStep >= 3 && status === 0;
      if (covered) {
        marker.setStyle({ fillColor: hot, fillOpacity: 1, color: "#0c0e2a", weight: 1.1, opacity: 0.85 });
        marker.setRadius(r + 1);
        marker.setTooltipContent(`Población cubierta · ${formatNumber(pop)} hab`);
      } else if (reachable) {
        marker.setStyle({
          fillColor: deep,
          fillOpacity: 0,
          color: deep,
          weight: 1.8,
          opacity: 0.95,
        });
        marker.setRadius(r);
        marker.setTooltipContent(`Alcanzable · sin antena · ${formatNumber(pop)} hab`);
      } else if (unreachable) {
        marker.setStyle({ fillColor: "#ffffff", fillOpacity: 0.22, color: "#0c0e2a", weight: 0.8, opacity: 0.5 });
        marker.setRadius(Math.max(1.6, r * 0.7));
        marker.setTooltipContent(`Sin alcance · ${formatNumber(pop)} hab`);
      } else {
        marker.setStyle({ fillColor: hot, fillOpacity: 0.9, color: "#0c0e2a", weight: 1.1, opacity: 0.85 });
        marker.setRadius(r);
        marker.setTooltipContent(`${formatNumber(pop)} hab`);
      }
    }

    /* paso 3: resaltar las antenas de la solución */
    for (const { marker, rho, sel } of cands) {
      const on = simStep >= 3 && sel;
      marker.getElement()?.querySelector(".sim-cand")?.classList.toggle("is-sel", on);
      rho.setStyle(
        on
          ? { opacity: 0.42, dashArray: "", fill: true, fillOpacity: 0.06, fillColor: "#ffffff" }
          : { opacity: 0.14, dashArray: "3 5", fill: false },
      );
    }

    /* encuadre: restringir pan/zoom a la ventana de estudio al llegar el vuelo */
    const [w, s, e, n] = simBundle.bounds;
    const lb = leafletRef.current!.latLngBounds(
      [s, w],
      [n, e],
    ) as unknown as Leaflet.LatLngBounds & { pad: (n: number) => Leaflet.LatLngBounds };
    const timer = window.setTimeout(() => {
      if (token !== restrictTokenRef.current) return;
      const m = mapRef.current;
      if (!m) return;
      m.setMaxBounds(lb.pad(0.12));
      const z = m.getBoundsZoom(lb);
      m.setMinZoom(Math.max(7, Math.floor(z) - 1));

      recompositeOverlay(m);
    }, 2300);
    return () => window.clearTimeout(timer);
  }, [simPilot, simBundle, simStep, mapReady]);

  return (
    <div
      className="absolute inset-0 z-0 isolate"
      role="application"
      aria-label="Mapa topográfico de Chile con las localidades de los pilotos. Seleccione un punto brillante para abrir su carta de impacto."
    >
      <div ref={containerRef} className="absolute inset-0" />

      {/* leyenda de cobertura de la capa de localidades (solo atlas) */}
      {!simPilot && (
        <div
          className="pointer-events-none absolute bottom-3 left-3 z-[900] hidden rounded-md border border-white/10 bg-night-2/85 px-3 py-2 backdrop-blur-sm sm:block"
          style={{ fontFamily: "var(--font-carto)" }}
        >
          <p className="text-[9px] uppercase tracking-[0.18em] text-white/45">
            Población rural · motor exacto
          </p>
          <ul className="mt-1.5 space-y-1">
            <li className="flex items-center gap-2 text-[11px] text-white/80">
              <span className="inline-block h-2 w-2 rounded-full bg-signal-hot shadow-[0_0_6px_1px_var(--signal-deep)]" />
              Población cubierta
            </li>
            <li className="flex items-center gap-2 text-[11px] text-white/55">
              <span className="inline-block h-2 w-2 rounded-full bg-white/25" />
              Pendiente de cobertura
            </li>
          </ul>
        </div>
      )}

      {/* velo al abrir la carta lateral */}
      {dimmed && (
        <div className="pointer-events-none absolute inset-0 z-[900] bg-night/50" aria-hidden />
      )}

      {/* atribución de la capa base */}
      <div
        className="pointer-events-none absolute bottom-3 right-3 z-[900] rounded-md border border-white/15 bg-night-2/85 px-3 py-1.5 text-right backdrop-blur-sm"
        style={{ fontFamily: "var(--font-carto)" }}
      >
        <p className="text-[11px] font-semibold leading-tight text-white/85">
          Mapa topográfico
        </p>
        <p className="text-[9px] leading-tight text-white/45">
          © OpenStreetMap · SRTM · OpenTopoMap
        </p>
      </div>
    </div>
  );
}

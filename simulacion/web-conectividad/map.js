// Mapa de Chile con las localidades de los tres pilotos como puntos de
// interés. Proyección equirectangular de paralelo estándar 36° S, calculada
// en runtime desde assets/chile.json (Natural Earth 1:50m, dominio público).
// Sin red y sin build (ADR 0008): los dos JSON están vendidos en assets/.
// El zoom a una zona anima el viewBox del SVG (easing cúbico) mientras los
// marcadores HTML de zona se re-proyectan por fotograma; los puntos son SVG
// y se desvanecen, la etiqueta/marcador de zona vive en HTML para mantenerse
// nítido en pantalla.

import { ZONES } from "./zones.js";

const VIEW_W = 1000;
const VIEW_H = 780;
const LAT_MAX = -17.3;
const LAT_MIN = -56.1;
const KX = Math.cos((36 * Math.PI) / 180);
const SCALE = VIEW_H / (LAT_MAX - LAT_MIN);
const ZONE_ACCENTS = {
  yumbel: "#e9ad45",
  biobio: "#6bbcad",
  metropolitana: "#dd795f",
};

function project(lon, lat) {
  return { x: lon * KX * SCALE, y: (LAT_MAX - lat) * SCALE };
}

function pathForGeometry(geometry) {
  const rings = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return rings
    .map((polygon) =>
      polygon
        .map((ring) =>
          ring
            .map((coordinate, index) => {
              const p = project(coordinate[0], coordinate[1]);
              return `${index ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
            })
            .join(" ") + " Z",
        )
        .join(" "),
    )
    .join(" ");
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function createChileMap(svg, markerLayer, { onZoneClick }) {
  let baseView = null;
  let animation = null;
  let markersByZone = new Map();
  let baseGeometry = null;

  function fitView() {
    // Ajusta la tinta de Chile al lienzo, centrada horizontalmente.
    const xs = [], ys = [];
    const rings = baseGeometry.type === "Polygon" ? [baseGeometry.coordinates] : baseGeometry.coordinates;
    rings.forEach((polygon) => polygon.forEach((ring) => ring.forEach(([lon, lat]) => {
      const p = project(lon, lat);
      xs.push(p.x); ys.push(p.y);
    })));
    const landWidth = Math.max(...xs) - Math.min(...xs);
    baseView = { x: Math.min(...xs) - (VIEW_W - landWidth) / 2, y: Math.min(...ys) - 10, width: VIEW_W, height: VIEW_H };
    return { ...baseView };
  }

  function screenPosition(view, x, y, rect) {
    // preserveAspectRatio="xMidYMid meet": el viewBox entra completo con
    // barras centradas; el factor es el mínimo de los dos ajustes.
    const scale = Math.min(rect.width / view.width, rect.height / view.height);
    const offsetX = (rect.width - view.width * scale) / 2;
    const offsetY = (rect.height - view.height * scale) / 2;
    return { left: offsetX + (x - view.x) * scale, top: offsetY + (y - view.y) * scale };
  }

  function placeMarkers(view) {
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    markersByZone.forEach((marker, id) => {
      const zone = ZONES.find((z) => z.id === id);
      const p = project(zone.center[0], zone.center[1]);
      const s = screenPosition(view, p.x, p.y, rect);
      // El punto del marcador queda sobre la coordenada: -50% centra el
      // bloque y -7px sube el centro del punto a la posición proyectada.
      marker.style.transform = `translate(${s.left.toFixed(1)}px, ${s.top.toFixed(1)}px) translate(-50%, -7px)`;
      const zoom = baseView.width / view.width;
      marker.style.setProperty("--zoom", zoom.toFixed(2));
      marker.classList.toggle("near", zoom > 6);
    });
  }

  function applyView(view) {
    svg.setAttribute("viewBox", `${view.x} ${view.y} ${view.width} ${view.height}`);
    placeMarkers(view);
  }

  function animateView(target, duration, onDone) {
    if (animation) window.cancelAnimationFrame(animation);
    const from = currentView();
    const start = window.performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const e = easeInOutCubic(t);
      applyView({
        x: from.x + (target.x - from.x) * e,
        y: from.y + (target.y - from.y) * e,
        width: from.width + (target.width - from.width) * e,
        height: from.height + (target.height - from.height) * e,
      });
      if (t < 1) {
        animation = window.requestAnimationFrame(tick);
      } else {
        animation = null;
        onDone?.();
      }
    };
    animation = window.requestAnimationFrame(tick);
  }

  function currentView() {
    const [x, y, width, height] = svg.getAttribute("viewBox").split(/\s+/).map(Number);
    return { x, y, width, height };
  }

  function zoneView(zone) {
    const [lon, lat] = zone.center;
    const halfWidth = 1.25 / KX;
    const halfHeight = 0.95;
    const p = project(lon, lat);
    return { x: p.x - halfWidth * KX * SCALE, y: p.y - halfHeight * SCALE, width: 2 * halfWidth * KX * SCALE, height: 2 * halfHeight * SCALE };
  }

  return {
    async load() {
      const [chile, localities] = await Promise.all([
        fetch("assets/chile.json").then((r) => r.json()),
        fetch("assets/localities.json").then((r) => r.json()),
      ]);
      baseGeometry = chile.geometry;
      const view = fitView();
      applyView(view);

      const ns = "http://www.w3.org/2000/svg";
      const land = document.createElementNS(ns, "path");
      land.setAttribute("class", "chile-land");
      land.setAttribute("d", pathForGeometry(baseGeometry));
      land.setAttribute("fill-rule", "evenodd");
      svg.appendChild(land);

      // Puntos = localidades de los pilotos (demand_points.geojson): halo
      // suave + núcleo, tamaño ∝ √población. Clic en cualquier punto o
      // marcador de zona abre la carta de su zona.
      ZONES.forEach((zone) => {
        const accent = ZONE_ACCENTS[zone.id];
        const group = document.createElementNS(ns, "g");
        group.setAttribute("class", `chile-dots dots-${zone.id}`);
        (localities[zone.localitiesKey] || []).forEach(([lon, lat, pop]) => {
          const p = project(lon, lat);
          const radius = 1.7 + 2.4 * Math.min(1, Math.sqrt(pop) / 38);
          const halo = document.createElementNS(ns, "circle");
          halo.setAttribute("class", "dot-halo");
          halo.setAttribute("cx", p.x.toFixed(1));
          halo.setAttribute("cy", p.y.toFixed(1));
          halo.setAttribute("r", (radius * 2.1).toFixed(1));
          halo.setAttribute("fill", accent);
          const core = document.createElementNS(ns, "circle");
          core.setAttribute("class", "dot-core");
          core.setAttribute("cx", p.x.toFixed(1));
          core.setAttribute("cy", p.y.toFixed(1));
          core.setAttribute("r", radius.toFixed(1));
          core.setAttribute("fill", accent);
          const hit = document.createElementNS(ns, "circle");
          hit.setAttribute("class", "dot-hit");
          hit.setAttribute("cx", p.x.toFixed(1));
          hit.setAttribute("cy", p.y.toFixed(1));
          hit.setAttribute("r", Math.max(6, radius * 2.4).toFixed(1));
          hit.setAttribute("fill", "transparent");
          hit.addEventListener("click", () => onZoneClick(zone));
          group.append(halo, core, hit);
        });
        svg.appendChild(group);
      });

      // Marcadores y etiquetas de zona en HTML (nítidos en cualquier zoom).
      ZONES.forEach((zone) => {
        const marker = document.createElement("button");
        marker.type = "button";
        marker.className = `zone-marker marker-${zone.id}`;
        marker.innerHTML = `<span class="zone-marker-dot"></span><span class="zone-marker-label">${zone.name}</span>`;
        marker.addEventListener("click", () => onZoneClick(zone));
        markerLayer.appendChild(marker);
        markersByZone.set(zone.id, marker);
      });
      placeMarkers(currentView());
      window.addEventListener("resize", () => placeMarkers(currentView()));
    },
    focusZone(zone, duration = 1500) {
      return new Promise((resolve) => {
        svg.classList.add("zooming");
        svg.classList.add(`focus-${zone.id}`);
        animateView(zoneView(zone), duration, () => resolve());
      });
    },
    resetView(duration = 1100) {
      svg.classList.remove("zooming", "focus-yumbel", "focus-biobio", "focus-metropolitana");
      return new Promise((resolve) => {
        animateView({ ...baseView }, duration, () => resolve());
      });
    },
    // Re-proyecta los marcadores cuando el mapa vuelve a ser visible
    // (con display:none el rect es 0 y no se puede posicionar).
    refresh() {
      placeMarkers(currentView());
    },
  };
}

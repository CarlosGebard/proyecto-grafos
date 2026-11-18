// Mapa de Chile con las localidades de los tres pilotos como puntos de
// interés. Proyección Web Mercator calculada en runtime sobre el mismo
// espacio de píxeles del tile z=7 de OpenStreetMap: la capa base son los
// tiles ensamblados por osm-tiles.js (imagen única en el SVG) y la silueta
// Natural Earth queda como contorno y respaldo sin red. El zoom a una zona
// anima el viewBox del SVG (easing cúbico) mientras los marcadores HTML se
// re-proyectan por fotograma; al enfocar una zona se carga una capa de
// detalle z=10 sobre ella (cacheada).

import { ZONES } from "./zones.js";
import { assembleTiles, mercatorX, mercatorY, ATTRIBUTION } from "./osm-tiles.js";

// Espacio de coordenadas del SVG = mundo Mercator a zoom 7 (256·2⁷ px).
const WORLD = 256 * 2 ** 7;
const BASE_ZOOM = 7;
const DETAIL_ZOOM = 10;
const ZONE_ACCENTS = {
  yumbel: "#e9ad45",
  biobio: "#6bbcad",
  metropolitana: "#dd795f",
};

function project(lon, lat) {
  return { x: mercatorX(lon, WORLD), y: mercatorY(lat, WORLD) };
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
    const left = Math.min(...xs), top = Math.min(...ys);
    const landWidth = Math.max(...xs) - left;
    const landHeight = Math.max(...ys) - top;
    // El viewBox entra completo (preserveAspectRatio meet): la relación del
    // lienzo la fija el CSS del SVG; aquí centrado con margen 6 %.
    const width = landWidth * 1.12;
    const height = landHeight * 1.12;
    baseView = { x: left + landWidth / 2 - width / 2, y: top + landHeight / 2 - height / 2, width, height };
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
    // 2,5° de ancho y ~1,9° de alto alrededor de la zona, medidos en el
    // espacio Mercator (diferencias de proyección, no grados lineales).
    const left = project(lon - 1.25, lat).x;
    const right = project(lon + 1.25, lat).x;
    const top = project(lon, lat + 0.95).y;
    const bottom = project(lon, lat - 0.95).y;
    return { x: left, y: top, width: right - left, height: bottom - top };
  }

  // Coloca una imagen de tiles (canvas ensamblado) como <image> del SVG,
  // en las coordenadas Mercator de sus bordes en grados.
  function placeTileImage(image, assembled) {
    const left = mercatorX(assembled.west, WORLD);
    const right = mercatorX(assembled.east, WORLD);
    const top = mercatorY(assembled.north, WORLD);
    const bottom = mercatorY(assembled.south, WORLD);
    image.setAttribute("href", assembled.canvas.toDataURL("image/png"));
    image.setAttribute("x", left.toFixed(1));
    image.setAttribute("y", top.toFixed(1));
    image.setAttribute("width", (right - left).toFixed(1));
    image.setAttribute("height", (bottom - top).toFixed(1));
    image.setAttribute("preserveAspectRatio", "none");
  }

  // Capa nacional z=7 detrás de todo; silueta Natural Earth queda encima
  // como contorno. Sin red (o con fallas) el fondo vuelve al tinte plano.
  async function loadBaseTiles(baseImage) {
    const xs = [];
    const ys = [];
    const rings = baseGeometry.type === "Polygon" ? [baseGeometry.coordinates] : baseGeometry.coordinates;
    rings.forEach((polygon) => polygon.forEach((ring) => ring.forEach(([lon, lat]) => {
      xs.push(lon); ys.push(lat);
    })));
    const assembled = await assembleTiles({
      west: Math.min(...xs) - 0.4,
      east: Math.max(...xs) + 0.4,
      south: Math.max(-85, Math.min(...ys) - 0.4),
      north: Math.min(85, Math.max(...ys) + 0.4),
      zoom: BASE_ZOOM,
      maxTiles: 200,
    });
    if (!assembled) return;
    placeTileImage(baseImage, assembled);
    svg.classList.add("tiles-ok");
  }

  // Capa de detalle z=10 por zona, cargada al enfocarla y cacheada.
  const detailByZone = new Map();
  async function loadDetailTiles(zone, detailImage) {
    let assembled = detailByZone.get(zone.id);
    if (!assembled) {
      const [lon, lat] = zone.center;
      assembled = await assembleTiles({
        west: lon - 2.0,
        east: lon + 2.0,
        south: lat - 1.5,
        north: lat + 1.5,
        zoom: DETAIL_ZOOM,
        maxTiles: 200,
      });
      if (!assembled) return;
      detailByZone.set(zone.id, assembled);
    }
    if (svg.classList.contains(`focus-${zone.id}`)) {
      placeTileImage(detailImage, assembled);
      detailImage.classList.add("visible");
    }
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
      const baseImage = document.createElementNS(ns, "image");
      baseImage.setAttribute("class", "chile-tiles-base");
      svg.appendChild(baseImage);
      const detailImage = document.createElementNS(ns, "image");
      detailImage.setAttribute("class", "chile-tiles-detail");
      svg.appendChild(detailImage);

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
      loadBaseTiles(baseImage);
      svg.dataset.tilesRef = ATTRIBUTION;
    },
    // Precarga la capa de detalle de una zona mientras su carta está
    // abierta: cuando el mapa vuela a la zona, los tiles z10 ya están.
    preloadZone(zone) {
      loadDetailTiles(zone, svg.querySelector(".chile-tiles-detail"));
    },
    focusZone(zone, duration = 1500) {
      return new Promise((resolve) => {
        svg.classList.add("zooming");
        svg.classList.add(`focus-${zone.id}`);
        loadDetailTiles(zone, svg.querySelector(".chile-tiles-detail"));
        animateView(zoneView(zone), duration, () => resolve());
      });
    },
    resetView(duration = 1100) {
      svg.classList.remove("zooming", "focus-yumbel", "focus-biobio", "focus-metropolitana");
      svg.querySelector(".chile-tiles-detail")?.classList.remove("visible");
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

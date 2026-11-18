// Capa base de OpenStreetMap (tiles raster estándar): ensambla en un canvas
// los tiles que cubren un rectángulo WGS84 y lo devuelve como imagen única
// para drapearlo sobre el relieve 3D o colgarlo detrás del SVG de Chile.
// Sin librerías: sólo Web Mercator aritmético. Si no hay red (o un tile
// falla), assembleTiles devuelve null y cada visor conserva su fondo local
// (paleta hipsométrica / silueta Natural Earth) — el visor funciona offline.
//
// Cortesía con los servidores de OSM (policy.hyt… uso aceptable): descargas
// en paralelo acotado, atribución visible y zoom moderado (nunca > 13 en el
// visor 3D ni > 10 en el mapa nacional).

const TILE_URL = "https://tile.openstreetmap.org";
const TILE_SIZE = 256;
const MAX_PARALLEL = 6;

export const ATTRIBUTION = "© OpenStreetMap contributors";

// Web Mercator: coordenada de píxel en el mundo completo a un zoom dado.
export function worldSize(zoom) {
  return TILE_SIZE * 2 ** zoom;
}

export function mercatorX(lon, world) {
  return ((lon + 180) / 360) * world;
}

export function mercatorY(lat, world) {
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const rad = (clamped * Math.PI) / 180;
  return (0.5 - Math.log((1 + Math.sin(rad)) / (1 - Math.sin(rad))) / (4 * Math.PI)) * world;
}

// Zoom que da ~`targetPixels` de ancho para la ventana, con topes prudentes.
export function zoomForWindow(west, south, east, north, targetPixels, maxZoom) {
  const latMid = ((south + north) / 2 * Math.PI) / 180;
  const metersWide = (east - west) * 111320 * Math.cos(latMid);
  const metersPerPx = metersWide / targetPixels;
  const zoom = Math.log2((156543.03392 * Math.cos(latMid)) / metersPerPx);
  return Math.max(2, Math.min(maxZoom, Math.round(zoom)));
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`tile ${url}`));
    image.src = url;
  });
}

// Ensambla los tiles de `zoom` que cubren [west,south]–[east,north]. Devuelve
// null si la mitad de los tiles falla (sin red) — el llamador conserva su
// fondo local. `canvas` nunca se lee píxel a píxel salvo por three.js/WebGL,
// que exige origen limpio: por eso crossOrigin y servidores con CORS.
export async function assembleTiles({ west, south, east, north, zoom, maxTiles = 120 }) {
  const world = worldSize(zoom);
  let x0 = Math.floor(mercatorX(west, world) / TILE_SIZE);
  let x1 = Math.floor(mercatorX(east, world) / TILE_SIZE);
  let y0 = Math.floor(mercatorY(north, world) / TILE_SIZE);
  let y1 = Math.floor(mercatorY(south, world) / TILE_SIZE);
  const maxTile = 2 ** zoom - 1;
  x0 = Math.max(0, x0); x1 = Math.min(maxTile, x1);
  y0 = Math.max(0, y0); y1 = Math.min(maxTile, y1);
  const count = (x1 - x0 + 1) * (y1 - y0 + 1);
  if (count > maxTiles) return null;

  const pixelX0 = x0 * TILE_SIZE;
  const pixelY0 = y0 * TILE_SIZE;
  const scale = 1; // 1 px de tile = 1 px de canvas
  const canvas = document.createElement("canvas");
  canvas.width = (x1 - x0 + 1) * TILE_SIZE;
  canvas.height = (y1 - y0 + 1) * TILE_SIZE;
  const context = canvas.getContext("2d");
  context.fillStyle = "#e8e4da"; // neutro: donde falte un tile no queda negro
  context.fillRect(0, 0, canvas.width, canvas.height);

  const jobs = [];
  for (let ty = y0; ty <= y1; ty += 1) {
    for (let tx = x0; tx <= x1; tx += 1) {
      jobs.push({ tx, ty });
    }
  }
  let failures = 0;
  const queue = jobs.splice(0);
  const workers = Math.min(MAX_PARALLEL, queue.length);
  async function worker() {
    while (queue.length) {
      const { tx, ty } = queue.shift();
      try {
        const image = await loadImage(`${TILE_URL}/${zoom}/${tx}/${ty}.png`);
        context.drawImage(image, (tx * TILE_SIZE - pixelX0) * scale, (ty * TILE_SIZE - pixelY0) * scale, TILE_SIZE * scale, TILE_SIZE * scale);
      } catch (_) {
        failures += 1;
      }
    }
  }
  await Promise.all(Array.from({ length: workers }, worker));
  if (failures > queue.length / 2) return null;

  return {
    canvas,
    // Rectángulo dibujado, en grados (bordes exteriores de los tiles): el
    // llamador lo posiciona en su proyección.
    west: (x0 * TILE_SIZE / world) * 360 - 180,
    east: ((x1 + 1) * TILE_SIZE / world) * 360 - 180,
    north: tileYToLat(y0, world),
    south: tileYToLat(y1 + 1, world),
    zoom,
  };
}

function tileYToLat(tileY, world) {
  // tileY es fila de tile: el píxel mundial es tileY·TILE_SIZE.
  const n = Math.PI - (2 * Math.PI * tileY * TILE_SIZE) / world;
  return (Math.atan(Math.sinh(n)) * 180) / Math.PI;
}

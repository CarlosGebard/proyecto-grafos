// Escena 3D del relieve regional (ADR 0008): three.js vendido, sin build ni red.
// La malla se construye desde terrain.json (artefacto de comunicación; nunca
// recalcula LOS). Tinta por vértice según la paleta hipsométrica exportada por
// el pipeline, idéntica a la del mapa PNG. La cobertura se dibuja como el
// rango nominal ρ(a) de cada antena (anillo + disco drapeados al relieve),
// no como círculos por localidad; las antenas se marcan como torres esbeltas
// (ADR 0012), no como volúmenes.

import * as THREE from "three";
import { OrbitControls } from "./vendor/OrbitControls.js";

const NODATA_COLOR = 0xd8d8d8;
const COLOR_LOCALITY = 0x39463e;
const COLOR_RANGE = 0xe9ad45;
const COLOR_RANGE_RIM = 0x8a5c14;
const COLOR_LINK = 0x6b3fa8;
const COLOR_CANDIDATE = 0xecf1ec;
const COLOR_SELECTED = 0x6b3fa8;
// Despegue del relleno de zonas sobre la malla (evita z-fighting con el
// terreno coplanar sin flotar a la vista; ~1 m a escala del piloto).
const ZONE_LIFT = 0.00008;
// El rango se dibuja sobre el relleno de zonas (ZONE_LIFT) y sus bordes
// (0.0006), por debajo de las exclusiones PRC (0.0012).
const RANGE_FILL_LIFT = 0.0009;
const RANGE_RIM_LIFT = 0.0011;
// Torre de telecomunicaciones como marcador (ADR 0012; altura a escala por
// ADR 0013): cuerpo en retícula (dos patas convergentes con travesaños),
// crucetas para los paneles por sector y mástil rematado en baliza. Todas
// las dimensiones son las de una torre real de referencia de 30 m — el
// umbral LGUC 116 bis F que exige recepción municipal — medidas con la
// MISMA escala vertical del relieve: sin altura simbólica fija. Los enlaces
// LOS parten de la punta del mástil.
const TOWER_HEIGHT_M = 30;
const TOWER_BASE_HALF_M = 2.1;
const TOWER_TOP_HALF_M = 0.42;
const TOWER_BODY_TOP = 0.8; // fracción de la altura donde van las crucetas
const TOWER_CROSSARM_M = 1.68;
const TOWER_TIP_M = 0.72;
const TOWER_BEACON_M = 2.28;
// Exageración vertical moderada (ADR 0013 revisa ADR 0009): ×2,5, la misma
// convención del hillshade del mapa PNG (relief.py VERTICAL_EXAGGERATION).
// A escala ×1 el desnivel de estas ventanas (≤3% del span) apenas se
// percibe — en Yumbel la torre simbólica anterior (≈1,2 km) eclipsaba el
// relieve; ×2,5 lo hace legible sin deformar la forma del terreno.
const VERTICAL_EXAGGERATION = 2.5;

const populationStops = [
  [0, [255, 238, 184]],
  [0.45, [239, 167, 82]],
  [1, [184, 72, 40]],
];

export function populationColor(value) {
  const start = populationStops.findLast(([position]) => position <= value) || populationStops[0];
  const end = populationStops.find(([position]) => position >= value) || populationStops.at(-1);
  const mix = (value - start[0]) / Math.max(0.0001, end[0] - start[0]);
  return start[1].map((channel, index) => Math.round(channel + (end[1][index] - channel) * mix));
}

// Estado de cada localidad frente a la solución (ADR 0014), la misma regla
// que coverage_status en src/evaluation/metrics.py: cubierta si la cubre
// una elegida; alcanzable si la cubre alguna candidata; si no, sin alcance.
export const COVERAGE_STATES = ["covered", "reachable", "unreachable"];
export const COVERAGE_STATE_COLORS = {
  covered: "#168354",
  reachable: "#e9ad45",
  unreachable: "#9aa39d",
};

export function coverageStatus(scenario, solution) {
  const covered = new Set((solution || []).flatMap((id) => scenario.coverage?.[id] || []));
  const reachable = new Set(Object.values(scenario.coverage || {}).flat());
  return (id) => (covered.has(id) ? "covered" : reachable.has(id) ? "reachable" : "unreachable");
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

// Área geodésica de un anillo WGS84 (exceso esférico; fórmula estándar tipo Turf.js).
function geodesicArea(ring) {
  const radius = 6378137;
  let total = 0;
  const count = ring.length;
  for (let index = 0; index < count; index += 1) {
    const [lon1, lat1] = ring[index];
    const [lon2, lat2] = ring[(index + 1) % count];
    total +=
      ((lon2 * Math.PI) / 180 - (lon1 * Math.PI) / 180) *
      (2 + Math.sin((lat1 * Math.PI) / 180) + Math.sin((lat2 * Math.PI) / 180));
  }
  return Math.abs((total * radius * radius) / 2);
}

// Coropletas por cuantiles (Brewer & Pickle 2002): robustas ante distribuciones
// sesgadas de población. Devuelve clases y la función de clasificación.
function densityClassification(densities, classCount = 5) {
  const count = Math.min(classCount, Math.max(1, densities.length));
  const sorted = [...densities].sort((a, b) => a - b);
  const raw = [];
  for (let index = 1; index < count; index += 1) {
    const position = (sorted.length - 1) * (index / count);
    const low = Math.floor(position);
    const high = Math.ceil(position);
    raw.push(sorted[low] + (sorted[high] - sorted[low]) * (position - low));
  }
  const breaks = [...new Set(raw.map((value) => Math.round(value * 100) / 100))];
  const of = (density) => {
    let index = 0;
    while (index < breaks.length && density > breaks[index]) index += 1;
    return index;
  };
  const levels = [Math.min(...densities, 0), ...breaks, Math.max(...densities, 0)];
  const total = breaks.length + 1;
  const classes = levels.slice(0, -1).map((min, index) => ({
    min,
    max: levels[index + 1],
    color: populationColor((index + 0.5) / total),
  }));
  return { breaks, of, classes };
}

function ringsOf(geometry) {
  if (geometry.type === "Polygon") return geometry.coordinates;
  return geometry.coordinates.map((polygon) => polygon[0]);
}

// Punto en polígono (par-impar sobre todos los anillos: agujeros incluidos).
function pointInRings(longitude, latitude, rings) {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const [x1, y1] = ring[i];
      const [x2, y2] = ring[j];
      if ((y1 > latitude) !== (y2 > latitude) && longitude < ((x2 - x1) * (latitude - y1)) / (y2 - y1) + x1) {
        inside = !inside;
      }
    }
  }
  return inside;
}

// Zonas SIN superposición: cada celda del DEM pertenece a lo sumo a una
// localidad (centro de celda decide; primer polígono que la contiene gana).
// El relleno resultante comparte los vértices exactos de la malla, de modo
// que las divisiones se adaptan al relieve en lugar de flotar sobre él.
function gridOwnership(terrain, polygonRings) {
  const { width, height } = terrain;
  const [west, south, east, north] = terrain.bounds_wgs84;
  const owner = new Int16Array(width * height).fill(-1);
  polygonRings.forEach((rings, zoneIndex) => {
    let minLon = Infinity;
    let maxLon = -Infinity;
    let minLat = Infinity;
    let maxLat = -Infinity;
    rings.forEach((ring) => ring.forEach(([lon, lat]) => {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }));
    const colStart = Math.max(0, Math.floor(((minLon - west) / (east - west)) * width) - 1);
    const colEnd = Math.min(width - 1, Math.ceil(((maxLon - west) / (east - west)) * width));
    const rowStart = Math.max(0, Math.floor(((north - maxLat) / (north - south)) * height) - 1);
    const rowEnd = Math.min(height - 1, Math.ceil(((north - minLat) / (north - south)) * height));
    for (let row = rowStart; row <= rowEnd; row += 1) {
      for (let col = colStart; col <= colEnd; col += 1) {
        const cell = row * width + col;
        if (owner[cell] !== -1) continue;
        const lon = west + ((col + 0.5) / width) * (east - west);
        const lat = north - ((row + 0.5) / height) * (north - south);
        if (pointInRings(lon, lat, rings)) owner[cell] = zoneIndex;
      }
    }
  });
  return owner;
}

function linesOf(geometry) {
  return geometry.type === "LineString" ? [geometry.coordinates] : geometry.coordinates;
}

// Círculo geodésico local de radio ρ en metros (misma aproximación que
// Turf.js circle): Δlat constante y Δlon corregido por cos(latitud). Para
// ρ ≤ 30 km a latitudes de Chile central el error es despreciable.
function rangeRing(longitude, latitude, radiusM, segments = 96) {
  const deltaLat = radiusM / 111320;
  const deltaLon = radiusM / (111320 * Math.cos((latitude * Math.PI) / 180));
  const ring = [];
  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    ring.push([
      longitude + Math.cos(angle) * deltaLon,
      latitude + Math.sin(angle) * deltaLat,
    ]);
  }
  return ring;
}

// Recorte del anillo (polígono convexo) a la ventana del DEM
// (Sutherland–Hodgman): el rango no se dibuja fuera del área modelada.
function clipRingToBounds(ring, bounds) {
  const [west, south, east, north] = bounds;
  const clipEdge = (points, inside, crossing) => {
    const result = [];
    for (let index = 0; index < points.length; index += 1) {
      const current = points[index];
      const previous = points[(index + points.length - 1) % points.length];
      const currentInside = inside(current);
      const previousInside = inside(previous);
      if (currentInside) {
        if (!previousInside) result.push(crossing(previous, current));
        result.push(current);
      } else if (previousInside) {
        result.push(crossing(previous, current));
      }
    }
    return result;
  };
  let clipped = ring;
  clipped = clipEdge(
    clipped,
    (point) => point[0] >= west,
    (a, b) => [west, a[1] + ((b[1] - a[1]) * (west - a[0])) / (b[0] - a[0])]
  );
  clipped = clipEdge(
    clipped,
    (point) => point[0] <= east,
    (a, b) => [east, a[1] + ((b[1] - a[1]) * (east - a[0])) / (b[0] - a[0])]
  );
  clipped = clipEdge(
    clipped,
    (point) => point[1] >= south,
    (a, b) => [a[0] + ((b[0] - a[0]) * (south - a[1])) / (b[1] - a[1]), south]
  );
  clipped = clipEdge(
    clipped,
    (point) => point[1] <= north,
    (a, b) => [a[0] + ((b[0] - a[0]) * (north - a[1])) / (b[1] - a[1]), north]
  );
  return clipped;
}

function makeMapper(terrain) {
  const [west, south, east, north] = terrain.bounds_wgs84;
  const [left, bottom, right, top] = terrain.bounds_metric_m || [0, 0, 1, 1];
  const widthM = Math.max(1, right - left);
  const heightM = Math.max(1, top - bottom);
  const spanM = Math.max(widthM, heightM);
  return {
    spanM,
    widthM,
    heightM,
    x2: (longitude) => (((longitude - west) / (east - west)) - 0.5) * 2 * (widthM / spanM),
    z2: (latitude) => (0.5 - ((latitude - south) / (north - south))) * 2 * (heightM / spanM),
  };
}

function colorAtStops(stops, fraction) {
  if (fraction <= 0) return new THREE.Color(stops[0].hex);
  if (fraction >= 1) return new THREE.Color(stops.at(-1).hex);
  const scaled = fraction * (stops.length - 1);
  const index = Math.floor(scaled);
  const color = new THREE.Color(stops[index].hex).lerp(
    new THREE.Color(stops[index + 1].hex),
    scaled - index
  );
  return color;
}

export function createTerrainView(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.setSize(container.clientWidth || 640, container.clientHeight || 420);
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#dce6df");

  const camera = new THREE.PerspectiveCamera(
    50,
    (container.clientWidth || 640) / (container.clientHeight || 420),
    0.01,
    100
  );
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 1.4;
  controls.maxDistance = 7;
  controls.maxPolarAngle = 1.45;
  controls.screenSpacePanning = false;

  scene.add(new THREE.AmbientLight(0xffffff, 1.0));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(-1.2, 1.6, -1.2); // Noroeste en alto: az 315°, alt 45°.
  scene.add(sun);

  const group = new THREE.Group();
  scene.add(group);

  let layers = null;
  let frame = null;

  function resetCamera() {
    const radius = 3.1;
    const pitch = 0.62;
    const yaw = -0.62;
    camera.position.set(
      radius * Math.cos(pitch) * Math.sin(yaw),
      radius * Math.sin(pitch),
      radius * Math.cos(pitch) * Math.cos(yaw)
    );
    controls.target.set(0, 0.05, 0);
    controls.update();
  }

  function disposeObject(object) {
    object.traverse((child) => {
      child.geometry?.dispose();
      if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
      else child.material?.dispose();
    });
  }

  function buildTerrain(terrain, mapper, elevationY, xs, zs) {
    const { width, height, elevations_m: rows, elevation_min_m: minimum } = terrain;
    const stops = terrain.palette?.stops || [];
    const count = width * height;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const range = Math.max(1e-6, terrain.elevation_max_m - minimum);
    for (let row = 0; row < height; row += 1) {
      for (let col = 0; col < width; col += 1) {
        const index = row * width + col;
        const raw = rows[row][col];
        const elevation = raw == null ? minimum : raw;
        positions[index * 3] = xs[col];
        positions[index * 3 + 1] = elevationY(elevation);
        positions[index * 3 + 2] = zs[row];
        const color = raw == null
          ? new THREE.Color(NODATA_COLOR)
          : colorAtStops(stops, (elevation - minimum) / range);
        colors[index * 3] = color.r;
        colors[index * 3 + 1] = color.g;
        colors[index * 3 + 2] = color.b;
      }
    }
    const indices = [];
    for (let row = 0; row < height - 1; row += 1) {
      for (let col = 0; col < width - 1; col += 1) {
        const a = row * width + col;
        const b = a + 1;
        const c = a + width;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const material = new THREE.MeshLambertMaterial({ vertexColors: true });
    const mesh = new THREE.Mesh(geometry, material);
    return mesh;
  }

  // Subdivide tramos largos a la celda del DEM: bordes, caminos y enlaces
  // siguen el relieve muestreado en cada punto en vez de cortar los cerros.
  function densify(coordinates, terrain) {
    const [west, south, east, north] = terrain.bounds_wgs84;
    const span = Math.max(terrain.width, terrain.height);
    const dense = [];
    coordinates.forEach(([longitude, latitude], index) => {
      if (!index) {
        dense.push([longitude, latitude]);
        return;
      }
      const [previousLon, previousLat] = coordinates[index - 1];
      const steps = Math.max(1, Math.ceil(
        Math.max(
          Math.abs(longitude - previousLon) / (east - west),
          Math.abs(latitude - previousLat) / (north - south)
        ) * span
      ));
      for (let step = 1; step <= steps; step += 1) {
        dense.push([
          previousLon + ((longitude - previousLon) * step) / steps,
          previousLat + ((latitude - previousLat) * step) / steps,
        ]);
      }
    });
    return dense;
  }

  function drapedFill(elevationY, geometryRings, mapper, sampleElevation, lift, material, terrain) {
    const positions = [];
    geometryRings.forEach((ring) => {
      if (ring.length < 3) return;
      const sampled = terrain ? densify(ring, terrain) : ring;
      const contour = sampled.map(([longitude, latitude]) =>
        new THREE.Vector2(mapper.x2(longitude), mapper.z2(latitude))
      );
      let triangles;
      try {
        triangles = THREE.ShapeUtils.triangulateShape(contour, []);
      } catch (_) {
        return;
      }
      triangles.forEach(([a, b, c]) => {
        [a, b, c].forEach((index) => {
          const [longitude, latitude] = sampled[index];
          positions.push(
            contour[index].x,
            elevationY(sampleElevation(longitude, latitude)) + lift,
            contour[index].y
          );
        });
      });
    });
    if (!positions.length) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    return new THREE.Mesh(geometry, material);
  }

  // Marcador de antena (ADR 0012, altura a escala por ADR 0013): torre de
  // telecomunicaciones dibujada con segmentos de línea — cuerpo esbelto,
  // crucetas y mástil rematado en una baliza. Cada medida es metros reales
  // convertidos con la escala vertical de la escena (scaleV, unidades por
  // metro, ya incluye la exageración del relieve): a la vista regional la
  // torre es un tic de píxel y pico; el zoom la revela completa. Devuelve un
  // Group con material propio en cada parte; update() cambia color y
  // opacidad de todos.
  function antennaGlyph(scaleV, elevationY, sampleElevation, mapper, longitude, latitude) {
    const x = mapper.x2(longitude);
    const z = mapper.z2(latitude);
    const y0 = elevationY(sampleElevation(longitude, latitude));
    const at = (meters) => y0 + meters * scaleV;
    const bodyY = at(TOWER_BODY_TOP * TOWER_HEIGHT_M);
    const tipY = at(TOWER_HEIGHT_M);
    const legWidthAt = (fraction) =>
      TOWER_BASE_HALF_M +
      ((TOWER_TOP_HALF_M - TOWER_BASE_HALF_M) * fraction) / TOWER_BODY_TOP;
    const segments = [
      // Patas convergentes de la retícula.
      [x - TOWER_BASE_HALF_M * scaleV, y0, z, x - TOWER_TOP_HALF_M * scaleV, bodyY, z],
      [x + TOWER_BASE_HALF_M * scaleV, y0, z, x + TOWER_TOP_HALF_M * scaleV, bodyY, z],
      // Travesaños horizontales del cuerpo.
      ...[0.3, 0.55, 0.78].map((fraction) => {
        const half = legWidthAt(fraction) * scaleV;
        const y = at(fraction * TOWER_HEIGHT_M);
        return [x - half, y, z, x + half, y, z];
      }),
      // Crucetas donde montan los paneles sectoriales.
      [x - TOWER_CROSSARM_M * scaleV, bodyY, z, x + TOWER_CROSSARM_M * scaleV, bodyY, z],
      [x, bodyY, z - TOWER_CROSSARM_M * scaleV, x, bodyY, z + TOWER_CROSSARM_M * scaleV],
      // Mástil superior y baliza de punta.
      [x, bodyY, z, x, tipY, z],
      [x - TOWER_TIP_M * scaleV, tipY, z, x + TOWER_TIP_M * scaleV, tipY, z],
      [x, tipY, z - TOWER_TIP_M * scaleV, x, tipY, z + TOWER_TIP_M * scaleV],
    ];
    const positions = [];
    segments.forEach(([ax, ay, az, bx, by, bz]) => positions.push(ax, ay, az, bx, by, bz));
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    const tower = new THREE.Group();
    const lines = new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({
        color: COLOR_CANDIDATE,
        transparent: true,
        opacity: 0.9,
      })
    );
    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(TOWER_BEACON_M * scaleV, 10, 8),
      new THREE.MeshBasicMaterial({
        color: COLOR_CANDIDATE,
        transparent: true,
        opacity: 0.9,
      })
    );
    beacon.position.set(x, tipY, z);
    tower.add(lines, beacon);
    return tower;
  }

  function drapedLine(elevationY, coordinates, mapper, sampleElevation, lift, material, terrain) {
    const positions = [];
    (terrain ? densify(coordinates, terrain) : coordinates).forEach(([longitude, latitude]) => {
      positions.push(
        mapper.x2(longitude),
        elevationY(sampleElevation(longitude, latitude)) + lift,
        mapper.z2(latitude)
      );
    });
    if (positions.length < 6) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    return new THREE.Line(geometry, material);
  }

  // Relleno de una zona como subconjunto de la propia grilla del DEM: vértices
  // idénticos a la malla (+ZONE_LIFT) → sigue el relieve sin superponerse a
  // ninguna otra zona (la propiedad de celdas es exclusiva).
  function zoneFillMesh(terrain, owner, zoneIndex, xs, zs, elevationY, material) {
    const { width, height, elevations_m: rows, elevation_min_m: minimum } = terrain;
    const nodeIndex = new Map();
    const positions = [];
    const indices = [];
    const heightAt = (row, col) => {
      const value = rows[row] ? rows[row][col] : null;
      return value == null ? minimum : value;
    };
    const nodeAt = (row, col) => {
      const key = row * width + col;
      let index = nodeIndex.get(key);
      if (index === undefined) {
        index = positions.length / 3;
        nodeIndex.set(key, index);
        positions.push(xs[col], elevationY(heightAt(row, col)) + ZONE_LIFT, zs[row]);
      }
      return index;
    };
    for (let row = 0; row < height - 1; row += 1) {
      for (let col = 0; col < width - 1; col += 1) {
        if (owner[row * width + col] !== zoneIndex) continue;
        const a = nodeAt(row, col);
        const b = nodeAt(row, col + 1);
        const c = nodeAt(row + 1, col);
        const d = nodeAt(row + 1, col + 1);
        indices.push(a, c, b, b, c, d);
      }
    }
    if (!indices.length) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return new THREE.Mesh(geometry, material);
  }

  function build(terrain, scenario) {
    if (!terrain.palette) {
      throw new Error("terrain.json sin paleta: regenera el piloto con el pipeline actual");
    }
    if (scenario.candidates.some((candidate) => candidate.radiusM == null)) {
      throw new Error("candidates.geojson sin radius_m: regenera el piloto con el pipeline actual");
    }
    const mapper = makeMapper(terrain);
    const [west, south, east, north] = terrain.bounds_wgs84;
    const sampleElevation = (longitude, latitude) => {
      const { width, height, elevations_m: rows } = terrain;
      const col = clamp(Math.round(((longitude - west) / (east - west)) * (width - 1)), 0, width - 1);
      const row = clamp(Math.round(((north - latitude) / (north - south)) * (height - 1)), 0, height - 1);
      const value = rows[row][col];
      return value == null ? terrain.elevation_min_m : value;
    };
    // Exageración vertical moderada (ADR 0013 revisa ADR 0009): la vertical
    // multiplica la conversión metros→unidades horizontal por
    // VERTICAL_EXAGGERATION (×2,5, la convención del hillshade del PNG). La
    // misma escala gobierna torres y enlaces: todo lo vertical queda
    // coerente entre sí.
    const scale = (2 / mapper.spanM) * VERTICAL_EXAGGERATION;
    const elevationY = (elevation) => (elevation - terrain.elevation_min_m) * scale;

    const next = { scenario, terrain };
    const xs = [];
    const zs = [];
    for (let col = 0; col < terrain.width; col += 1) {
      xs.push(mapper.x2(west + (col / (terrain.width - 1)) * (east - west)));
    }
    for (let row = 0; row < terrain.height; row += 1) {
      zs.push(mapper.z2(north - (row / (terrain.height - 1)) * (north - south)));
    }
    next.terrainMesh = buildTerrain(terrain, mapper, elevationY, xs, zs);

    // Segunda dimensión: densidad de población (hab/km²) por cuantiles.
    // La subdivisión es parte del terreno (una misma dimensión): rellenos
    // iluminados como el relieve y a ras de superficie.
    const densities = scenario.localityPolygons.map((locality) => {
      const areaKm2 = ringsOf(locality.geometry).reduce(
        (sum, ring) => sum + geodesicArea(ring),
        0
      ) / 1e6;
      return areaKm2 > 0 ? locality.population / areaKm2 : 0;
    });
    const classification = densityClassification(densities);
    next.densityClassification = classification;

    // Localidades: coropletas de densidad integradas al terreno. El relleno
    // es un subconjunto de la grilla del DEM (celdas exclusivas: nunca dos
    // zonas se superponen) y sigue el relieve vértice a vértice; el borde se
    // dibuja densificado sobre esa misma superficie.
    const ownership = gridOwnership(
      terrain,
      scenario.localityPolygons.map((locality) => ringsOf(locality.geometry))
    );
    next.localities = scenario.localityPolygons.map((locality, index) => {
      const [red, green, blue] = classification.classes[
        classification.of(densities[index])
      ].color;
      const fill = zoneFillMesh(
        terrain,
        ownership,
        index,
        xs,
        zs,
        elevationY,
        new THREE.MeshLambertMaterial({
          color: new THREE.Color(red / 255, green / 255, blue / 255),
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
      );
      const outlines = ringsOf(locality.geometry)
        .filter((ring) => ring.length >= 3)
        .map((ring) =>
          drapedLine(
            elevationY,
            ring,
            mapper,
            sampleElevation,
            0.0006,
            new THREE.LineBasicMaterial({ color: 0x233226, transparent: true, opacity: 0.6 }),
            terrain
          )
        )
        .filter(Boolean);
      return { fill, outlines };
    });

    // Caminos OSM (capa opcional).
    const wide = new Set(["motorway", "trunk", "primary", "secondary"]);
    next.roads = (scenario.roads || []).map((road) => {
      const isWide = wide.has(road.properties.highway);
      return linesOf(road.geometry)
        .map((line) =>
          drapedLine(
            elevationY,
            line,
            mapper,
            sampleElevation,
            0.0004,
            new THREE.LineBasicMaterial({
              color: 0x403424,
              transparent: true,
              opacity: isWide ? 0.85 : 0.45,
            }),
            terrain
          )
        )
        .filter(Boolean);
    }).flat();

    // Exclusiones PRC (screening, no permiso): rojo translúcido + borde.
    const exclusions = (scenario.constraints || []).filter(
      (feature) => feature.properties.constraint_status === "excluded"
    );
    next.constraints = exclusions.map((feature) => {
      const fill = drapedFill(
        elevationY,
        ringsOf(feature.geometry),
        mapper,
        sampleElevation,
        0.0012,
        new THREE.MeshBasicMaterial({
          color: 0xa72f24,
          transparent: true,
          opacity: 0.24,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
        terrain
      );
      const outlines = ringsOf(feature.geometry)
        .filter((ring) => ring.length >= 3)
        .map((ring) =>
          drapedLine(
            elevationY,
            ring,
            mapper,
            sampleElevation,
            0.0014,
            new THREE.LineBasicMaterial({ color: 0x80251e, transparent: true, opacity: 0.8 }),
            terrain
          )
        )
        .filter(Boolean);
      return { fill, outlines };
    });

    // Rango nominal ρ(a): anillo + disco drapeados al relieve por antena.
    // El radio viene de candidates.geojson (radius_m; el pipeline
    // ya resolvió None → max_distance_m). Es el rango de la antena, no una
    // certificación de cobertura: el visor no recalcula LOS (ADR 0003).
    // Sin volumen 3D (ADR 0012): un hemisferio de radio ρ(a) sugería una
    // estructura masiva y un alcance vertical que la señal no tiene.
    const coverageProducing = new Set(
      Object.keys(scenario.coverage || {}).filter(
        (id) => (scenario.coverage[id] || []).length > 0
      )
    );
    next.ranges = scenario.candidates.map((candidate) => {
      const hasCoverage = coverageProducing.has(candidate.id);
      const radiusM = candidate.radiusM || 0;
      if (!radiusM) {
        return { id: candidate.id, hasCoverage, fill: null, rims: [] };
      }
      const ring = clipRingToBounds(
        rangeRing(candidate.longitude, candidate.latitude, radiusM),
        [west, south, east, north]
      );
      if (ring.length < 3) {
        return { id: candidate.id, hasCoverage, fill: null, rims: [] };
      }
      const fill = drapedFill(
        elevationY,
        [ring],
        mapper,
        sampleElevation,
        RANGE_FILL_LIFT,
        new THREE.MeshLambertMaterial({
          color: COLOR_RANGE,
          transparent: true,
          opacity: 0.06,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
        terrain
      );
      const rims = [
        drapedLine(
          elevationY,
          [...ring, ring[0]],
          mapper,
          sampleElevation,
          RANGE_RIM_LIFT,
          new THREE.LineBasicMaterial({
            color: COLOR_RANGE_RIM,
            transparent: true,
            opacity: 0.5,
          }),
          terrain
        ),
      ].filter(Boolean);
      return { id: candidate.id, hasCoverage, fill, rims };
    });

    // Localidades como puntos (∝ √población). Neutros hasta el paso
    // solución; ahí toman el color de su estado de cobertura (ADR 0014).
    const demandRadius = (population) => 0.014 + 0.05 * Math.min(1, Math.sqrt(population) / 170);
    next.demands = scenario.demands.map((demand) => {
      const radius = demandRadius(demand.population);
      const geometry = new THREE.SphereGeometry(radius, 12, 8);
      const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: COLOR_LOCALITY }));
      mesh.position.set(
        mapper.x2(demand.longitude),
        elevationY(sampleElevation(demand.longitude, demand.latitude)) + radius * 1.2,
        mapper.z2(demand.latitude)
      );
      return mesh;
    });

    // Antenas candidatas y seleccionadas: torres esbeltas a escala (ADR 0012/0013).
    next.candidates = scenario.candidates.map((candidate) =>
      antennaGlyph(scale, elevationY, sampleElevation, mapper, candidate.longitude, candidate.latitude)
    );

    // Enlaces LOS entre seleccionadas: tramos entre las puntas de las torres.
    const solutionSet = new Set(scenario.connectedSolution || []);
    const linkPositions = [];
    const emitted = new Set();
    Object.entries(scenario.connectivity || {}).forEach(([sourceId, neighbors]) => {
      neighbors.forEach((targetId) => {
        const key = [sourceId, targetId].sort().join("-");
        if (emitted.has(key) || !solutionSet.has(sourceId) || !solutionSet.has(targetId)) return;
        emitted.add(key);
        const source = scenario.candidates.find((candidate) => candidate.id === sourceId);
        const target = scenario.candidates.find((candidate) => candidate.id === targetId);
        if (!source || !target) return;
        // Ruta densificada sobre el relieve (pares consecutivos para LineSegments).
        const path = densify([[source.longitude, source.latitude], [target.longitude, target.latitude]], terrain)
          .map(([longitude, latitude]) => [
            mapper.x2(longitude),
            elevationY(sampleElevation(longitude, latitude)) + TOWER_HEIGHT_M * scale,
            mapper.z2(latitude),
          ]);
        for (let point = 1; point < path.length; point += 1) {
          linkPositions.push(...path[point - 1], ...path[point]);
        }
      });
    });
    const linkGeometry = new THREE.BufferGeometry();
    linkGeometry.setAttribute("position", new THREE.Float32BufferAttribute(linkPositions, 3));
    next.links = new THREE.LineSegments(
      linkGeometry,
      new THREE.LineBasicMaterial({ color: COLOR_LINK })
    );

    // Ejes métricos desde la esquina suroeste del relieve.
    const minimumY = elevationY(terrain.elevation_min_m) + 0.002;
    const maximumY = elevationY(terrain.elevation_max_m) + 0.002;
    const origin = [mapper.x2(west), minimumY, mapper.z2(south)];
    const axisSpecs = [
      [[mapper.x2(east), minimumY, mapper.z2(south)], 0xdd7957],
      [[mapper.x2(west), minimumY, mapper.z2(north)], 0x6bbcad],
      [[mapper.x2(west), maximumY, mapper.z2(south)], 0xf1e4ac],
    ];
    next.axes = axisSpecs.map(([endPoint, color]) => {
      const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(...origin),
        new THREE.Vector3(...endPoint),
      ]);
      return new THREE.Line(geometry, new THREE.LineBasicMaterial({ color }));
    });

    disposeObject(group);
    group.clear();
    next.terrainMesh.renderOrder = 0;
    group.add(next.terrainMesh);
    next.localities.forEach(({ fill, outlines }) => {
      if (fill) {
        fill.renderOrder = 2;
        group.add(fill);
      }
      outlines.forEach((outline) => {
        outline.renderOrder = 3;
        group.add(outline);
      });
    });
    next.roads.forEach((line) => {
      line.renderOrder = 1;
      group.add(line);
    });
    next.constraints.forEach(({ fill, outlines }) => {
      if (fill) {
        fill.renderOrder = 4;
        group.add(fill);
      }
      outlines.forEach((outline) => {
        outline.renderOrder = 5;
        group.add(outline);
      });
    });
    next.ranges.forEach((range) => {
      if (range.fill) {
        range.fill.renderOrder = 6;
        group.add(range.fill);
      }
      range.rims.forEach((rim) => {
        rim.renderOrder = 7;
        group.add(rim);
      });
    });
    next.demands.forEach((mesh) => group.add(mesh));
    next.candidates.forEach((mesh) => group.add(mesh));
    group.add(next.links);
    next.axes.forEach((line) => group.add(line));
    layers = next;
  }

  function update(state) {
    if (!layers) return;
    const { scenario } = layers;
    const showCandidates = state.step >= 1;
    const showCoverage = state.step >= 2;
    const showSolution = state.step === 3;
    const selected = showSolution ? new Set(scenario.connectedSolution) : new Set();
    const statusOf = coverageStatus(scenario, showSolution ? scenario.connectedSolution : []);

    layers.candidates.forEach((tower, index) => {
      const candidate = scenario.candidates[index];
      const isSelected = selected.has(candidate.id);
      // En la solución sólo quedan las antenas elegidas: las candidatas
      // descartadas se remueven de la escena.
      tower.visible = showCandidates && (!showSolution || isSelected);
      if (!tower.visible) return;
      tower.traverse((part) => {
        if (!part.material) return;
        part.material.color.set(isSelected ? COLOR_SELECTED : COLOR_CANDIDATE);
        part.material.opacity = isSelected ? 1 : 0.9;
        part.material.transparent = !isSelected;
      });
    });
    layers.ranges.forEach((range) => {
      // Paso cobertura: rango de cada candidata que alcanza al menos una
      // localidad (por distancia y LOS ya calculados). Paso solución: sólo
      // las elegidas, con tinte más fuerte.
      const active = showCoverage && (showSolution ? selected.has(range.id) : range.hasCoverage);
      if (range.fill) {
        range.fill.visible = active;
        range.fill.material.opacity = showSolution ? 0.18 : 0.06;
      }
      range.rims.forEach((rim) => {
        rim.visible = active;
        rim.material.opacity = showSolution ? 0.75 : 0.5;
      });
    });
    // Población afectada vs no afectada (ADR 0014): el tono de la coropleta
    // sigue siendo la densidad (ADR 0009); en el paso solución las no
    // cubiertas sólo se atenúan y dejan ver el relieve.
    layers.localities.forEach(({ fill, outlines }, index) => {
      const locality = scenario.localityPolygons[index];
      const isCovered = showSolution && statusOf(locality.id) === "covered";
      if (fill) fill.material.opacity = showSolution && !isCovered ? 0.3 : 0.9;
      outlines.forEach((outline) => {
        outline.material.color.set(isCovered ? 0xf7f4df : 0x233226);
        outline.material.opacity = isCovered ? 0.95 : 0.6;
        outline.material.linewidth = isCovered ? 2 : 1;
      });
    });
    layers.demands.forEach((mesh, index) => {
      const id = scenario.demands[index].id;
      mesh.material.color.set(
        showSolution ? COVERAGE_STATE_COLORS[statusOf(id)] : COLOR_LOCALITY
      );
    });
    layers.constraints.forEach(({ fill, outlines }) => {
      const visible = state.showPrcConstraints;
      if (fill) fill.visible = visible;
      outlines.forEach((outline) => { outline.visible = visible; });
    });
    layers.links.visible = showSolution && Boolean(scenario.hasConnectivity);
  }

  function render(state) {
    // La construcción es determinista por (terrain, scenario): sólo se
    // reconstruye al cambiar de piloto, no en cada paso del recorrido.
    if (!layers || layers.terrain !== state.terrain || layers.scenario !== state.scenario) {
      build(state.terrain, state.scenario);
    }
    update(state);
  }

  // Zoom con botones (complementa la rueda de OrbitControls): acerca o aleja
  // la cámara sobre la línea de vista, respetando los topes de OrbitControls.
  function zoomBy(factor) {
    const offset = camera.position.clone().sub(controls.target);
    const distance = clamp(offset.length() * factor, controls.minDistance, controls.maxDistance);
    offset.setLength(distance);
    camera.position.copy(controls.target).add(offset);
    controls.update();
  }

  function animate() {
    frame = window.requestAnimationFrame(animate);
    if (container.offsetParent === null) return;
    controls.update();
    renderer.render(scene, camera);
  }

  const observer = new ResizeObserver(() => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  });
  observer.observe(container);

  resetCamera();
  animate();

  return {
    render,
    update,
    reset: resetCamera,
    zoomIn: () => zoomBy(0.75),
    zoomOut: () => zoomBy(1.33),
    get densityClasses() {
      return layers?.densityClassification?.classes || [];
    },
  };
}

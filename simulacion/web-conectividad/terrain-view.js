// Escena 3D del relieve regional (ADR 0008): three.js vendido, sin build ni red.
// La malla se construye desde terrain.json (artefacto de comunicación; nunca
// recalcula LOS). Tinta por vértice según la paleta hipsométrica exportada por
// el pipeline, idéntica a la del mapa PNG. Antenas y enlaces: placeholders.

import * as THREE from "three";
import { OrbitControls } from "./vendor/OrbitControls.js";

const DEFAULT_EXAGGERATION = 10;
const NODATA_COLOR = 0xd8d8d8;
const COLOR_COVERED = 0xb44828;
const COLOR_REACHABLE = 0xe9ad45;
const COLOR_UNCOVERED = 0xe9eee9;
const COLOR_LINK = 0x0c7666;
const COLOR_CANDIDATE = 0xecf1ec;
const COLOR_SELECTED = 0x0c7666;

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

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function ringsOf(geometry) {
  if (geometry.type === "Polygon") return geometry.coordinates;
  return geometry.coordinates.map((polygon) => polygon[0]);
}

function linesOf(geometry) {
  return geometry.type === "LineString" ? [geometry.coordinates] : geometry.coordinates;
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

  let exaggeration = DEFAULT_EXAGGERATION;
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
    controls.target.set(0, 0.15, 0);
    controls.update();
  }

  function disposeObject(object) {
    object.traverse((child) => {
      child.geometry?.dispose();
      if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
      else child.material?.dispose();
    });
  }

  function buildTerrain(terrain, mapper, elevationY) {
    const { width, height, elevations_m: rows, elevation_min_m: minimum } = terrain;
    const stops = terrain.palette?.stops || [];
    const count = width * height;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const range = Math.max(1e-6, terrain.elevation_max_m - minimum);
    for (let row = 0; row < height; row += 1) {
      for (let col = 0; col < width; col += 1) {
        const index = row * width + col;
        const longitude = terrain.bounds_wgs84[0] + (col / (width - 1)) * (terrain.bounds_wgs84[2] - terrain.bounds_wgs84[0]);
        const latitude = terrain.bounds_wgs84[3] - (row / (height - 1)) * (terrain.bounds_wgs84[3] - terrain.bounds_wgs84[1]);
        const raw = rows[row][col];
        const elevation = raw == null ? minimum : raw;
        positions[index * 3] = mapper.x2(longitude);
        positions[index * 3 + 1] = elevationY(elevation);
        positions[index * 3 + 2] = mapper.z2(latitude);
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

  function drapedFill(elevationY, geometryRings, mapper, sampleElevation, lift, material) {
    const positions = [];
    geometryRings.forEach((ring) => {
      if (ring.length < 3) return;
      const contour = ring.map(([longitude, latitude]) =>
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
          const [longitude, latitude] = ring[index];
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

  function drapedLine(elevationY, coordinates, mapper, sampleElevation, lift, material) {
    const positions = [];
    coordinates.forEach(([longitude, latitude]) => {
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

  function build(terrain, scenario) {
    if (!terrain.palette) {
      throw new Error("terrain.json sin paleta: regenera el piloto con el pipeline actual");
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
    const scale = (2 * exaggeration) / mapper.spanM;
    const elevationY = (elevation) => (elevation - terrain.elevation_min_m) * scale;
    const populations = scenario.localityPolygons.map((locality) => locality.population);
    const populationMin = populations.length ? Math.min(...populations) : 0;
    const populationMax = populations.length ? Math.max(...populations) : 1;

    const next = { scenario, terrain };
    next.terrainMesh = buildTerrain(terrain, mapper, elevationY);

    // Localidades: relleno por población + borde (verde si cubierta).
    next.localities = scenario.localityPolygons.map((locality) => {
      const intensity = clamp(
        (locality.population - populationMin) /
          Math.max(1, populationMax - populationMin),
        0,
        1
      );
      const [red, green, blue] = populationColor(intensity);
      const fill = drapedFill(
        elevationY,
        ringsOf(locality.geometry),
        mapper,
        sampleElevation,
        0.004,
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(red / 255, green / 255, blue / 255),
          transparent: true,
          opacity: 0.52,
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
            0.005,
            new THREE.LineBasicMaterial({ color: 0x233226, transparent: true, opacity: 0.6 })
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
            0.008,
            new THREE.LineBasicMaterial({
              color: 0x403424,
              transparent: true,
              opacity: isWide ? 0.85 : 0.45,
            })
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
        0.01,
        new THREE.MeshBasicMaterial({
          color: 0xa72f24,
          transparent: true,
          opacity: 0.24,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
      );
      const outlines = ringsOf(feature.geometry)
        .filter((ring) => ring.length >= 3)
        .map((ring) =>
          drapedLine(
            elevationY,
            ring,
            mapper,
            sampleElevation,
            0.011,
            new THREE.LineBasicMaterial({ color: 0x80251e, transparent: true, opacity: 0.8 })
          )
        )
        .filter(Boolean);
      return { fill, outlines };
    });

    // Localidades como puntos (estado de cobertura en la solución).
    const demandRadius = (population) => 0.014 + 0.05 * Math.min(1, Math.sqrt(population) / 170);
    next.demands = scenario.demands.map((demand) => {
      const radius = demandRadius(demand.population);
      const geometry = new THREE.SphereGeometry(radius, 12, 8);
      const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: COLOR_UNCOVERED }));
      mesh.position.set(
        mapper.x2(demand.longitude),
        elevationY(sampleElevation(demand.longitude, demand.latitude)) + radius * 1.2,
        mapper.z2(demand.latitude)
      );
      return mesh;
    });

    // Antenas candidatas y seleccionadas: marcadores cónicos placeholder.
    const coneGeometry = new THREE.ConeGeometry(0.02, 0.06, 12);
    next.candidates = scenario.candidates.map((candidate) => {
      const mesh = new THREE.Mesh(coneGeometry, new THREE.MeshBasicMaterial({ color: COLOR_CANDIDATE }));
      mesh.position.set(
        mapper.x2(candidate.longitude),
        elevationY(sampleElevation(candidate.longitude, candidate.latitude)) + 0.03,
        mapper.z2(candidate.latitude)
      );
      return mesh;
    });

    // Enlaces LOS entre seleccionadas: segmentos placeholder entre cimas.
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
        linkPositions.push(
          mapper.x2(source.longitude),
          elevationY(sampleElevation(source.longitude, source.latitude)) + 0.07,
          mapper.z2(source.latitude),
          mapper.x2(target.longitude),
          elevationY(sampleElevation(target.longitude, target.latitude)) + 0.07,
          mapper.z2(target.latitude)
        );
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
    const covered = showSolution
      ? new Set(scenario.connectedSolution.flatMap((id) => scenario.coverage[id] || []))
      : new Set();
    const reachable = showCoverage
      ? new Set(Object.values(scenario.coverage).flat())
      : new Set();

    layers.candidates.forEach((mesh, index) => {
      const candidate = scenario.candidates[index];
      mesh.visible = showCandidates;
      mesh.material.color.set(selected.has(candidate.id) ? COLOR_SELECTED : COLOR_CANDIDATE);
      mesh.material.opacity = selected.has(candidate.id) ? 1 : 0.9;
      mesh.material.transparent = !selected.has(candidate.id);
    });
    layers.demands.forEach((mesh, index) => {
      const demand = scenario.demands[index];
      mesh.material.color.set(
        covered.has(demand.id)
          ? COLOR_COVERED
          : reachable.has(demand.id)
            ? COLOR_REACHABLE
            : COLOR_UNCOVERED
      );
    });
    layers.localities.forEach(({ outlines }, index) => {
      const locality = scenario.localityPolygons[index];
      const isCovered = covered.has(locality.id);
      outlines.forEach((outline) => {
        outline.material.color.set(isCovered ? 0xf7f4df : 0x233226);
        outline.material.opacity = isCovered ? 0.95 : 0.6;
        outline.material.linewidth = isCovered ? 2 : 1;
      });
    });
    layers.constraints.forEach(({ fill, outlines }) => {
      const visible = state.showPrcConstraints;
      if (fill) fill.visible = visible;
      outlines.forEach((outline) => { outline.visible = visible; });
    });
    layers.links.visible = showSolution && Boolean(scenario.hasConnectivity);
  }

  function render(state) {
    build(state.terrain, state.scenario);
    update(state);
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
    get exaggeration() {
      return exaggeration;
    },
    setExaggeration(value) {
      exaggeration = value;
    },
  };
}

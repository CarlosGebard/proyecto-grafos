"use strict";

const svgNs = "http://www.w3.org/2000/svg";
const network = document.querySelector("#network");
const terrainCanvas = document.querySelector("#terrain-3d");
const terrainReset = document.querySelector("#terrain-reset");
const prcLayerToggle = document.querySelector("#prc-layer-toggle");
const mapLegend = document.querySelector(".legend");
const previousButton = document.querySelector("#previous-button");
const nextButton = document.querySelector("#next-button");
const playButton = document.querySelector("#play-button");
const sceneStatus = document.querySelector("#scene-status");
const demoTab = document.querySelector("#demo-tab");
const biobioTab = document.querySelector("#biobio-tab");
const metroTab = document.querySelector("#metro-tab");
const yumbelTab = document.querySelector("#yumbel-tab");
const antennaAsset = new Image();
const terrainVerticalExaggeration = 10;
antennaAsset.src = "assets/radio-tower.svg";
antennaAsset.addEventListener("load", () => {
  if (state.view === "terrain") drawTerrain();
});

const demo = {
  name: "Ejemplo didáctico",
  k: 3,
  demands: [
    { id: "L1", label: "L1", x: 86, y: 110, population: 60 },
    { id: "L2", label: "L2", x: 215, y: 72, population: 60 },
    { id: "L3", label: "L3", x: 336, y: 148, population: 70 },
    { id: "L4", label: "L4", x: 452, y: 74, population: 100 },
    { id: "L5", label: "L5", x: 555, y: 178, population: 40 },
    { id: "L6", label: "L6", x: 640, y: 95, population: 80 },
  ],
  candidates: [
    { id: "A", label: "A", x: 126, y: 332 },
    { id: "B", label: "B", x: 305, y: 294 },
    { id: "C", label: "C", x: 470, y: 355 },
    { id: "D", label: "D", x: 593, y: 290 },
  ],
  coverage: {
    A: ["L1", "L2"],
    B: ["L2", "L3"],
    C: ["L4", "L5"],
    D: ["L5", "L6"],
  },
  connectivity: { A: ["B"], B: ["A", "D"], C: [], D: ["B"] },
  connectedSolution: ["A", "B", "D"],
};

const steps = [
  {
    title: "Localidades y población",
    copy: "Cada círculo es una localidad. Su tamaño muestra cuántas personas se busca cubrir.",
  },
  {
    title: "Posiciones candidatas",
    copy: "El criterio territorial propone sitios: anclas en localidades, intersecciones de cobertura y sitios altos del relieve. Todavía no sabemos cuáles conviene elegir.",
  },
  {
    title: "Aristas de cobertura",
    copy: "Los puntos naranjas son localidades que al menos una antena candidata puede cubrir por distancia y línea de vista.",
  },
  {
    title: "Solución conectada",
    copy: "Se eligen hasta k antenas que cubren la mayor población posible y forman una sola red.",
  },
];

const state = {
  scenario: demo,
  biobio: null,
  metropolitana: null,
  yumbel: null,
  terrain: null,
  view: "diagram",
  camera: { yaw: -0.62, pitch: 0.62 },
  drag: null,
  showPrcConstraints: false,
  animationFrame: null,
  step: 0,
  timer: null,
  elements: { demands: new Map(), candidates: new Map(), coverage: [], links: [] },
};

function node(name, attributes = {}) {
  const element = document.createElementNS(svgNs, name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
  return element;
}

function number(value) {
  return new Intl.NumberFormat("es-CL").format(Math.round(value));
}

function demandById(id) {
  return state.scenario.demands.find((demand) => demand.id === id);
}

function candidateById(id) {
  return state.scenario.candidates.find((candidate) => candidate.id === id);
}

function coveredBy(solution) {
  return new Set(solution.flatMap((candidate) => state.scenario.coverage[candidate] || []));
}

function population(ids) {
  return [...ids].reduce((sum, id) => sum + demandById(id).population, 0);
}

function addLine(group, className, left, right, source, target) {
  const line = node("line", { class: className, x1: left.x, y1: left.y, x2: right.x, y2: right.y });
  group.append(line);
  return { line, source, target };
}

function render() {
  const isTerrain = state.view === "terrain";
  updatePrcLayerToggle();
  network.hidden = isTerrain;
  terrainCanvas.hidden = !isTerrain;
  network.style.display = isTerrain ? "none" : "block";
  terrainCanvas.style.display = isTerrain ? "block" : "none";
  terrainReset.hidden = !isTerrain;
  mapLegend.hidden = isTerrain;
  mapLegend.style.display = isTerrain ? "none" : "flex";
  if (isTerrain) {
    drawTerrain();
    update();
    return;
  }
  network.replaceChildren();
  state.elements = { demands: new Map(), candidates: new Map(), coverage: [], links: [] };
  if (state.scenario.mapGeometry) {
    const mapGroup = node("g", { "aria-label": "Mapa territorial" });
    mapGroup.append(node("path", { class: "study-area", d: state.scenario.mapGeometry.area }));
    state.scenario.mapGeometry.localities.forEach((path) => mapGroup.append(node("path", { class: "locality-area", d: path })));
    network.append(mapGroup);
    if (state.showPrcConstraints) renderPrcConstraints();
  } else {
    const terrain = node("g", { "aria-hidden": "true" });
    [[30, 250, 165, 190, 300, 250, 430, 200, 575, 250, 700, 215], [8, 365, 170, 405, 300, 350, 465, 415, 590, 360, 718, 395]].forEach((points) => {
      terrain.append(node("polyline", { class: "terrain", points: points.join(" ") }));
    });
    network.append(terrain);
  }

  const coverageGroup = node("g", { "aria-label": "Aristas de cobertura" });
  Object.entries(state.scenario.coverage).forEach(([candidateId, demandIds]) => {
    const candidate = candidateById(candidateId);
    demandIds.forEach((demandId) => {
      state.elements.coverage.push(addLine(coverageGroup, "coverage-edge", candidate, demandById(demandId), candidateId, demandId));
    });
  });
  network.append(coverageGroup);

  const linkGroup = node("g", { "aria-label": "Enlaces entre antenas" });
  const emitted = new Set();
  Object.entries(state.scenario.connectivity).forEach(([candidateId, neighbors]) => {
    neighbors.forEach((neighborId) => {
      const key = [candidateId, neighborId].sort().join("-");
      if (!emitted.has(key)) {
        emitted.add(key);
        state.elements.links.push(addLine(linkGroup, "link-edge", candidateById(candidateId), candidateById(neighborId), candidateId, neighborId));
      }
    });
  });
  network.append(linkGroup);

  const demandGroup = node("g", { "aria-label": "Localidades" });
  const showDemandLabels = state.scenario.demands.length <= 10;
  state.scenario.demands.forEach((demand) => {
    const radius = state.scenario.mapGeometry
      ? Math.max(3.5, Math.min(10, 3 + Math.sqrt(demand.population) / 6))
      : 7 + Math.sqrt(demand.population) / 2;
    const circle = node("circle", { class: "demand-node", cx: demand.x, cy: demand.y, r: radius });
    const title = node("title");
    title.textContent = `${demand.label}: ${number(demand.population)} habitantes`;
    circle.append(title);
    demandGroup.append(circle);
    if (showDemandLabels) {
      const label = node("text", { class: "demand-label", x: demand.x + 12, y: demand.y - 11 });
      label.textContent = demand.label;
      demandGroup.append(label);
    }
    state.elements.demands.set(demand.id, circle);
  });
  network.append(demandGroup);

  const candidateGroup = node("g", { "aria-label": "Antenas candidatas" });
  const showCandidateLabels = state.scenario.candidates.length <= 10;
  state.scenario.candidates.forEach((candidate) => {
    const circle = node("circle", { class: "candidate-node", cx: candidate.x, cy: candidate.y, r: 12 });
    const title = node("title");
    title.textContent = `Antena candidata ${candidate.label}`;
    circle.append(title);
    candidateGroup.append(circle);
    const label = node("text", { class: "node-label", x: candidate.x + 16, y: candidate.y + 5 });
    label.textContent = candidate.label;
    if (showCandidateLabels) candidateGroup.append(label);
    state.elements.candidates.set(candidate.id, { circle, label });
  });
  network.append(candidateGroup);
  update();
}

function prcExclusions() {
  return (state.scenario.constraints || []).filter(
    (feature) => feature.properties.constraint_status === "excluded"
  );
}

function updatePrcLayerToggle() {
  const exclusions = prcExclusions();
  const available = exclusions.length > 0;
  prcLayerToggle.hidden = !available;
  prcLayerToggle.setAttribute("aria-pressed", String(state.showPrcConstraints));
  prcLayerToggle.textContent = `Restricciones PRC (${exclusions.length})`;
}

function renderPrcConstraints() {
  const group = node("g", { class: "prc-exclusions", "aria-label": "Exclusiones territoriales explícitas del PRC" });
  prcExclusions().forEach((feature) => {
    const path = node("path", { class: "prc-exclusion", d: pathForGeometry(feature.geometry, state.scenario.project) });
    const title = node("title");
    title.textContent = `Exclusión PRC: ${feature.properties.prc_zone || feature.properties.prc_name || "zona restringida"}`;
    path.append(title);
    group.append(path);
  });
  network.append(group);
}

function update() {
  const showCandidates = state.step >= 1;
  const showCoverage = state.step >= 2;
  const showLinks = false;
  const showSolution = state.step === steps.length - 1;
  const selected = showSolution ? new Set(state.scenario.connectedSolution) : new Set();
  const covered = showSolution ? coveredBy(state.scenario.connectedSolution) : new Set();
  const reachable = showCoverage
    ? new Set(Object.values(state.scenario.coverage).flat())
    : new Set();

  state.elements.candidates.forEach(({ circle, label }, id) => {
    circle.classList.toggle("show", showCandidates);
    label.classList.toggle("show", showCandidates);
    circle.classList.toggle("selected", selected.has(id));
  });
  state.elements.coverage.forEach(({ line }) => {
    line.classList.toggle("show", false);
  });
  state.elements.links.forEach(({ line, source, target }) => {
    line.classList.toggle("show", showLinks);
    line.classList.toggle("selected", showSolution && selected.has(source) && selected.has(target));
  });
  state.elements.demands.forEach((circle, id) => {
    circle.classList.toggle("covered", covered.has(id));
    circle.classList.toggle("reachable", !covered.has(id) && reachable.has(id));
  });

  const step = steps[state.step];
  document.querySelector("#step-index").textContent = `${state.step + 1} de ${steps.length}`;
  const noConnectivity = state.scenario.mapGeometry && !state.scenario.hasConnectivity && state.step >= 3;
  document.querySelector("#step-title").textContent = noConnectivity ? "Cobertura del piloto" : step.title;
  document.querySelector("#step-copy").textContent = noConnectivity
    ? "Este resultado existente muestra cobertura. Regenera el piloto con el pipeline actualizado para añadir enlaces entre antenas."
    : step.copy;
  document.querySelector("#covered-value").textContent = showSolution ? number(population(covered)) : "0";
  document.querySelector("#selected-value").textContent = showSolution ? `${selected.size} de ${state.scenario.k}` : `0 de ${state.scenario.k}`;
  document.querySelector("#connected-value").textContent = noConnectivity
    ? "No calculado"
    : showSolution ? "Sí" : state.step >= 3 ? "Por verificar" : "Aún no aplica";
  previousButton.disabled = state.step === 0;
  nextButton.disabled = state.step === steps.length - 1;
  playButton.textContent = state.timer ? "Pausar" : state.step === steps.length - 1 ? "Ver de nuevo" : "Reproducir";
}

function stop() {
  if (state.timer) window.clearInterval(state.timer);
  state.timer = null;
}

function setStep(step) {
  state.step = Math.max(0, Math.min(steps.length - 1, step));
  update();
  if (state.view === "terrain") drawTerrain();
}

function play() {
  if (state.timer) {
    stop();
    update();
    return;
  }
  if (state.step === steps.length - 1) setStep(0);
  state.timer = window.setInterval(() => {
    if (state.step === steps.length - 1) {
      stop();
      update();
    } else {
      setStep(state.step + 1);
    }
  }, 1800);
  update();
}

function setActiveTab(tab) {
  const tabs = { demo: demoTab, biobio: biobioTab, metro: metroTab, yumbel: yumbelTab };
  Object.entries(tabs).forEach(([name, button]) => {
    const active = name === tab;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
}

function pathForGeometry(geometry, project) {
  const rings = geometry.type === "Polygon" ? geometry.coordinates : geometry.coordinates.flat();
  return rings.map((ring) => ring.map((coordinate, index) => {
    const point = project(coordinate);
    return `${index ? "L" : "M"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
  }).join(" ") + " Z").join(" ");
}

async function loadOutput(directory, name) {
  try {
    const paths = ["demand.geojson", "demand_points.geojson", "candidates.geojson", "study_area.geojson", "graph.json", "metrics.json"];
    const responses = await Promise.all(paths.map(async (path) => {
      const response = await fetch(`../outputs/${directory}/${path}`);
      if (!response.ok) throw new Error(path);
      return response.json();
    }));
    const [demand, demandPoints, candidates, area, graph, metrics] = responses;
    let connectivity = null;
    let roads = [];
    let constraints = [];
    try {
      const response = await fetch(`../outputs/${directory}/connectivity.json`);
      if (response.ok) connectivity = await response.json();
    } catch (_) { /* La conectividad es opcional. */ }
    try {
      const response = await fetch(`../outputs/${directory}/roads.geojson`);
      if (response.ok) {
        const mainRoads = new Set(["motorway", "trunk", "primary", "secondary", "tertiary"]);
        roads = (await response.json()).features.filter((road) => mainRoads.has(road.properties.highway));
      }
    } catch (_) { /* La capa OSM es opcional. */ }
    try {
      const response = await fetch(`../outputs/${directory}/constraints.geojson`);
      if (response.ok) constraints = (await response.json()).features;
    } catch (_) { /* El filtro PRC es opcional. */ }
    const coordinates = demandPoints.features.map((feature) => feature.geometry.coordinates);
    const bounds = coordinates.reduce((value, [x, y]) => [Math.min(value[0], x), Math.min(value[1], y), Math.max(value[2], x), Math.max(value[3], y)], [Infinity, Infinity, -Infinity, -Infinity]);
    const project = ([x, y]) => ({ x: 42 + ((x - bounds[0]) / (bounds[2] - bounds[0])) * 636, y: 45 + ((bounds[3] - y) / (bounds[3] - bounds[1])) * 365 });
    const connectedResult = metrics.results.find((result) => result.algorithm === "exact_connected");
    return {
      name,
      k: metrics.results[0].k,
      demands: demandPoints.features.map((feature) => ({ id: feature.properties.id, label: feature.properties.id, population: feature.properties.population, longitude: feature.geometry.coordinates[0], latitude: feature.geometry.coordinates[1], ...project(feature.geometry.coordinates) })),
      candidates: candidates.features.map((feature) => ({ id: feature.properties.id, label: feature.properties.id, longitude: feature.geometry.coordinates[0], latitude: feature.geometry.coordinates[1], constraintStatus: feature.properties.constraint_status, ...project(feature.geometry.coordinates) })),
      coverage: graph.coverage,
      connectivity: Object.fromEntries(candidates.features.map((feature) => [feature.properties.id, connectivity?.[feature.properties.id] || []])),
      connectedSolution: (connectedResult || metrics.results[0]).selected,
      hasConnectivity: Boolean(connectivity && connectedResult),
      mapGeometry: { area: pathForGeometry(area.features[0].geometry, project), localities: demand.features.map((feature) => pathForGeometry(feature.geometry, project)) },
      project,
      localityPolygons: demand.features.map((feature) => ({ id: feature.properties.id, population: feature.properties.population, geometry: feature.geometry })),
      roads,
      constraints,
    };
  } catch (_) {
    return null;
  }
}

async function loadBiobio() {
  if (!state.biobio) state.biobio = await loadOutput("biobio", "Piloto Biobío (criterio)");
  return Boolean(state.biobio);
}

async function loadMetropolitana() {
  if (!state.metropolitana) state.metropolitana = await loadOutput("metropolitana", "Piloto Metropolitana (criterio)");
  return Boolean(state.metropolitana);
}

async function loadYumbel() {
  if (!state.yumbel) state.yumbel = await loadOutput("yumbel-criterio", "Yumbel 50 km · PRC + clases (criterio)");
  return Boolean(state.yumbel);
}

async function loadTerrain(directory) {
  try {
    const response = await fetch(`../outputs/${directory}/terrain.json`);
    if (!response.ok) throw new Error("terrain.json");
    return response.json();
  } catch (_) {
    return null;
  }
}

async function showBiobio() {
  stop();
  sceneStatus.textContent = "Cargando piloto Biobío";
  if (!(await loadBiobio())) {
    sceneStatus.textContent = "Piloto Biobío no disponible";
    return;
  }
  state.scenario = state.biobio;
  state.view = "map";
  state.step = 0;
  sceneStatus.textContent = state.scenario.name;
  setActiveTab("biobio");
  render();
}

async function showMetropolitana() {
  stop();
  sceneStatus.textContent = "Cargando piloto Metropolitana";
  if (!(await loadMetropolitana())) {
    sceneStatus.textContent = "Piloto Metropolitana no disponible";
    return;
  }
  state.scenario = state.metropolitana;
  state.view = "map";
  state.step = 0;
  sceneStatus.textContent = state.scenario.name;
  setActiveTab("metro");
  render();
}

function showDemo() {
  stop();
  state.scenario = demo;
  state.view = "diagram";
  state.step = 0;
  sceneStatus.textContent = demo.name;
  setActiveTab("demo");
  render();
}

async function showTerrain() {
  stop();
  sceneStatus.textContent = "Cargando relieve 3D";
  if (!(await loadBiobio())) {
    showDemo();
    sceneStatus.textContent = "Piloto Biobío no disponible";
    return;
  }
  state.terrain = await loadTerrain("biobio");
  if (!state.terrain) {
    showDemo();
    sceneStatus.textContent = "Falta terreno 3D";
    return;
  }
  state.scenario = state.biobio;
  state.view = "terrain";
  state.step = 0;
  state.camera = { yaw: -0.62, pitch: 0.62 };
  sceneStatus.textContent = "Relieve 3D · arrastra para rotar";
  setActiveTab("terrain");
  render();
}

async function showYumbel() {
  stop();
  sceneStatus.textContent = "Cargando Yumbel 50 km";
  if (!(await loadYumbel())) {
    sceneStatus.textContent = "Simulación Yumbel no disponible";
    return;
  }
  state.terrain = await loadTerrain("yumbel-criterio");
  if (!state.terrain) {
    sceneStatus.textContent = "Falta relieve Yumbel";
    return;
  }
  state.scenario = state.yumbel;
  state.view = "terrain";
  state.step = 0;
  state.camera = { yaw: -0.62, pitch: 0.62 };
  sceneStatus.textContent = "Yumbel 50 km · PRC + clases de potencia · arrastra para rotar";
  setActiveTab("yumbel");
  render();
}

function terrainPoint(longitude, latitude, elevation) {
  const [west, south, east, north] = state.terrain.bounds_wgs84;
  const [left, bottom, right, top] = state.terrain.bounds_metric_m || [0, 0, 1, 1];
  const widthM = Math.max(1, right - left);
  const heightM = Math.max(1, top - bottom);
  const spanM = Math.max(widthM, heightM);
  const x = ((longitude - west) / (east - west) - 0.5) * 2 * widthM / spanM;
  const y = ((latitude - south) / (north - south) - 0.5) * 2 * heightM / spanM;
  const z = (elevation - state.terrain.elevation_min_m) / spanM * 2 * terrainVerticalExaggeration;
  const { yaw, pitch } = state.camera;
  const horizontal = x * Math.cos(yaw) - y * Math.sin(yaw);
  const depth = x * Math.sin(yaw) + y * Math.cos(yaw);
  return { horizontal, depth, vertical: z * 0.48 + depth * Math.sin(pitch) };
}

function canvasPoint(point, scale, centerX, centerY) {
  return { x: centerX + point.horizontal * scale, y: centerY + point.vertical * scale };
}

function elevationAt(longitude, latitude) {
  const [west, south, east, north] = state.terrain.bounds_wgs84;
  const col = Math.max(0, Math.min(state.terrain.width - 1, Math.round((longitude - west) / (east - west) * (state.terrain.width - 1))));
  const row = Math.max(0, Math.min(state.terrain.height - 1, Math.round((north - latitude) / (north - south) * (state.terrain.height - 1))));
  return state.terrain.elevations_m[row][col] ?? state.terrain.elevation_min_m;
}

function terrainColor(value) {
  const stops = [
    [0, [39, 85, 93]],
    [.28, [72, 125, 88]],
    [.62, [136, 151, 83]],
    [1, [214, 202, 167]],
  ];
  const start = stops.findLast(([position]) => position <= value) || stops[0];
  const end = stops.find(([position]) => position >= value) || stops.at(-1);
  const span = Math.max(.0001, end[0] - start[0]);
  const mix = (value - start[0]) / span;
  return start[1].map((channel, index) => Math.round(channel + (end[1][index] - channel) * mix));
}

function drawElevationLegend(context, width, height) {
  const minimum = Math.round(state.terrain.elevation_min_m);
  const maximum = Math.round(state.terrain.elevation_max_m);
  const x = 22;
  const y = height - 34;
  const gradient = context.createLinearGradient(x, y, x + 146, y);
  [0, .28, .62, 1].forEach((value) => {
    const [red, green, blue] = terrainColor(value);
    gradient.addColorStop(value, `rgb(${red}, ${green}, ${blue})`);
  });
  context.fillStyle = "rgba(19, 40, 32, .82)";
  context.fillRect(x - 10, y - 22, 214, 42);
  context.fillStyle = gradient;
  context.fillRect(x, y - 3, 146, 9);
  context.fillStyle = "#edf3ed";
  context.font = "12px system-ui";
  context.fillText(`${minimum} m`, x, y - 8);
  context.fillText(`${maximum} m`, x + 154, y + 5);
  context.fillText("Elevación", x, y + 18);
}

function populationColor(value) {
  const stops = [
    [0, [255, 238, 184]],
    [.45, [239, 167, 82]],
    [1, [184, 72, 40]],
  ];
  const start = stops.findLast(([position]) => position <= value) || stops[0];
  const end = stops.find(([position]) => position >= value) || stops.at(-1);
  const mix = (value - start[0]) / Math.max(.0001, end[0] - start[0]);
  return start[1].map((channel, index) => Math.round(channel + (end[1][index] - channel) * mix));
}

function geometryRings(geometry) {
  return geometry.type === "Polygon" ? geometry.coordinates : geometry.coordinates.flat();
}

function geometryLines(geometry) {
  return geometry.type === "LineString" ? [geometry.coordinates] : geometry.coordinates;
}

function drawPopulationLegend(context, width, height, minimum, maximum) {
  const x = width - 184;
  const y = height - 34;
  const gradient = context.createLinearGradient(x, y, x + 126, y);
  [0, .45, 1].forEach((value) => {
    const [red, green, blue] = populationColor(value);
    gradient.addColorStop(value, `rgb(${red}, ${green}, ${blue})`);
  });
  context.fillStyle = "rgba(19, 40, 32, .82)";
  context.fillRect(x - 10, y - 22, 172, 42);
  context.fillStyle = gradient;
  context.fillRect(x, y - 3, 126, 9);
  context.fillStyle = "#edf3ed";
  context.font = "12px system-ui";
  context.fillText(`${Math.round(minimum)}`, x, y - 8);
  context.fillText(`${Math.round(maximum)} hab.`, x + 132, y + 5);
  context.fillText("Población", x, y + 18);
}

function drawMetricAxes(context, scale, centerX, centerY) {
  if (!state.terrain.bounds_metric_m) return;
  const [west, south, east, north] = state.terrain.bounds_wgs84;
  const [left, bottom, right, top] = state.terrain.bounds_metric_m;
  const minimum = state.terrain.elevation_min_m;
  const maximum = state.terrain.elevation_max_m;
  const origin = canvasPoint(terrainPoint(west, south, minimum), scale, centerX, centerY);
  const eastPoint = canvasPoint(terrainPoint(east, south, minimum), scale, centerX, centerY);
  const northPoint = canvasPoint(terrainPoint(west, north, minimum), scale, centerX, centerY);
  const heightPoint = canvasPoint(terrainPoint(west, south, maximum), scale, centerX, centerY);
  const km = (value) => new Intl.NumberFormat("es-CL", { maximumFractionDigits: 1 }).format(value / 1000);
  const axes = [
    [eastPoint, "#dd7957", `Este: 0-${km(right - left)} km`],
    [northPoint, "#6bbcad", `Norte: 0-${km(top - bottom)} km`],
    [heightPoint, "#f1e4ac", `Elevación: ${Math.round(minimum)}-${Math.round(maximum)} m (×${terrainVerticalExaggeration})`],
  ];
  context.font = "11px system-ui";
  axes.forEach(([point, color, label]) => {
    context.strokeStyle = color;
    context.fillStyle = color;
    context.lineWidth = 2;
    context.beginPath(); context.moveTo(origin.x, origin.y); context.lineTo(point.x, point.y); context.stroke();
    context.beginPath(); context.arc(point.x, point.y, 3, 0, Math.PI * 2); context.fill();
    context.fillStyle = "rgba(18, 39, 31, .78)";
    const textWidth = context.measureText(label).width;
    context.fillRect(point.x + 5, point.y - 15, textWidth + 8, 18);
    context.fillStyle = color;
    context.fillText(label, point.x + 9, point.y - 2);
  });
}

function drawRoads(context, project) {
  if (!state.scenario.roads?.length) return;
  const wide = new Set(["motorway", "trunk", "primary", "secondary"]);
  state.scenario.roads.forEach((road) => {
    const width = wide.has(road.properties.highway) ? 2 : 1;
    context.strokeStyle = wide.has(road.properties.highway)
      ? "rgba(64, 52, 36, .85)"
      : "rgba(64, 52, 36, .45)";
    context.lineWidth = width;
    geometryLines(road.geometry).forEach((line) => {
      context.beginPath();
      line.forEach(([longitude, latitude], index) => {
        const point = project({ longitude, latitude });
        if (index) context.lineTo(point.x, point.y); else context.moveTo(point.x, point.y);
      });
      context.stroke();
    });
  });
  context.fillStyle = "rgba(18, 39, 31, .78)";
  context.fillRect(18, 46, 154, 20);
  context.fillStyle = "#edf3ed";
  context.font = "11px system-ui";
  context.fillText("© OpenStreetMap contributors", 24, 60);
}

function drawConstraints(context, project) {
  if (!state.showPrcConstraints) return;
  const exclusions = prcExclusions();
  if (!exclusions.length) return;
  context.fillStyle = "rgba(167, 47, 36, .24)";
  context.strokeStyle = "rgba(128, 37, 30, .8)";
  context.lineWidth = .7;
  exclusions.forEach((feature) => geometryRings(feature.geometry).forEach((ring) => {
    context.beginPath();
    ring.forEach(([longitude, latitude], index) => {
      const point = project({ longitude, latitude });
      if (index) context.lineTo(point.x, point.y); else context.moveTo(point.x, point.y);
    });
    context.closePath();
    context.fill();
    context.stroke();
  }));
  context.fillStyle = "rgba(18, 39, 31, .78)";
  const label = `PRC: ${exclusions.length} exclusiones explícitas`;
  const width = context.measureText(label).width;
  context.fillRect(18, 70, width + 12, 20);
  context.fillStyle = "#edf3ed";
  context.font = "11px system-ui";
  context.fillText(label, 24, 84);
}

function drawTerrain() {
  if (!state.terrain) return;
  const rect = terrainCanvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  terrainCanvas.width = Math.round(rect.width * ratio);
  terrainCanvas.height = Math.round(rect.height * ratio);
  const context = terrainCanvas.getContext("2d");
  context.scale(ratio, ratio);
  context.clearRect(0, 0, rect.width, rect.height);
  context.fillStyle = "#dce6df";
  context.fillRect(0, 0, rect.width, rect.height);
  const scale = Math.min(rect.width * 0.39, rect.height * 0.56);
  const centerX = rect.width / 2;
  const centerY = rect.height * 0.60;
  const { width, height, elevations_m: elevations } = state.terrain;
  const range = Math.max(1, state.terrain.elevation_max_m - state.terrain.elevation_min_m);
  const points = Array.from({ length: height }, (_, row) => Array.from({ length: width }, (_, col) => {
    const elevation = elevations[row][col] ?? state.terrain.elevation_min_m;
    const longitude = state.terrain.bounds_wgs84[0] + col / (width - 1) * (state.terrain.bounds_wgs84[2] - state.terrain.bounds_wgs84[0]);
    const latitude = state.terrain.bounds_wgs84[3] - row / (height - 1) * (state.terrain.bounds_wgs84[3] - state.terrain.bounds_wgs84[1]);
    return canvasPoint(terrainPoint(longitude, latitude, elevation), scale, centerX, centerY);
  }));
  const cells = [];
  for (let row = 0; row < height - 1; row += 1) for (let col = 0; col < width - 1; col += 1) {
    const elevation = (
      (elevations[row][col] ?? 0) +
      (elevations[row + 1][col] ?? 0) +
      (elevations[row][col + 1] ?? 0) +
      (elevations[row + 1][col + 1] ?? 0)
    ) / 4;
    cells.push({ row, col, elevation, depth: (points[row][col].y + points[row + 1][col + 1].y) / 2 });
  }
  cells.sort((left, right) => left.depth - right.depth);
  cells.forEach(({ row, col, elevation }) => {
    const [red, green, blue] = terrainColor(Math.max(0, Math.min(1, (elevation - state.terrain.elevation_min_m) / range)));
    context.fillStyle = `rgb(${red}, ${green}, ${blue})`;
    context.beginPath();
    [points[row][col], points[row][col + 1], points[row + 1][col + 1], points[row + 1][col]].forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
    context.closePath();
    context.fill();
  });
  const showCoverage = state.step >= 2;
  const showCandidates = state.step >= 1;
  const selected = new Set(state.step === steps.length - 1 ? state.scenario.connectedSolution : []);
  const covered = state.step === steps.length - 1 ? coveredBy(state.scenario.connectedSolution) : new Set();
  const reachable = showCoverage
    ? new Set(Object.values(state.scenario.coverage).flat())
    : new Set();
  const projectNode = (item) => canvasPoint(terrainPoint(item.longitude, item.latitude, elevationAt(item.longitude, item.latitude)), scale, centerX, centerY);
  if (state.scenario.localityPolygons) {
    const values = state.scenario.localityPolygons.map((locality) => locality.population);
    const populationMin = Math.min(...values);
    const populationRange = Math.max(1, Math.max(...values) - populationMin);
    const polygons = state.scenario.localityPolygons.map((locality) => {
      const rings = geometryRings(locality.geometry).map((ring) => ring.map(([longitude, latitude]) => {
        const elevation = elevationAt(longitude, latitude);
        return canvasPoint(terrainPoint(longitude, latitude, elevation), scale, centerX, centerY);
      }));
      const depth = rings[0].reduce((sum, point) => sum + point.y, 0) / rings[0].length;
      return { ...locality, rings, depth };
    }).sort((left, right) => left.depth - right.depth);
    polygons.forEach((locality) => {
      const intensity = (locality.population - populationMin) / populationRange;
      const [red, green, blue] = populationColor(intensity);
      context.fillStyle = `rgba(${red}, ${green}, ${blue}, .52)`;
      context.strokeStyle = covered.has(locality.id) ? "#f7f4df" : "rgba(35, 50, 38, .58)";
      context.lineWidth = covered.has(locality.id) ? 1.8 : .65;
      locality.rings.forEach((ring) => {
        context.beginPath();
        ring.forEach((point, index) => index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y));
        context.closePath();
        context.fill();
        context.stroke();
      });
    });
    drawPopulationLegend(context, rect.width, rect.height, populationMin, populationMin + populationRange);
  }
  drawConstraints(context, projectNode);
  drawRoads(context, projectNode);
  drawMetricAxes(context, scale, centerX, centerY);
  if (state.step === steps.length - 1 && state.scenario.hasConnectivity) {
    const emitted = new Set();
    context.strokeStyle = "#0c7666";
    context.lineWidth = 3;
    state.scenario.connectedSolution.forEach((sourceId) => {
      (state.scenario.connectivity[sourceId] || []).forEach((targetId) => {
        const key = [sourceId, targetId].sort().join("-");
        if (selected.has(targetId) && !emitted.has(key)) {
          emitted.add(key);
          const start = projectNode(candidateById(sourceId));
          const end = projectNode(candidateById(targetId));
          context.beginPath(); context.moveTo(start.x, start.y); context.lineTo(end.x, end.y); context.stroke();
        }
      });
    });
  }
  state.scenario.demands.forEach((demand) => {
    const point = projectNode(demand);
    context.fillStyle = covered.has(demand.id)
      ? "#b44828"
      : reachable.has(demand.id) ? "#e9ad45" : "#e9eee9";
    context.strokeStyle = "#193128";
    context.lineWidth = 1.5;
    context.beginPath(); context.arc(point.x, point.y, 3.8, 0, Math.PI * 2); context.fill(); context.stroke();
  });
  if (showCandidates) state.scenario.candidates.forEach((candidate) => {
    const point = projectNode(candidate);
    const size = selected.has(candidate.id) ? 28 : 20;
    context.fillStyle = selected.has(candidate.id) ? "#0c7666" : "rgba(236, 241, 236, .9)";
    context.beginPath(); context.arc(point.x, point.y + 5, size * .48, 0, Math.PI * 2); context.fill();
    if (antennaAsset.complete) context.drawImage(antennaAsset, point.x - size / 2, point.y - size, size, size);
  });
  drawElevationLegend(context, rect.width, rect.height);
}

previousButton.addEventListener("click", () => { stop(); setStep(state.step - 1); });
nextButton.addEventListener("click", () => { stop(); setStep(state.step + 1); });
playButton.addEventListener("click", play);
demoTab.addEventListener("click", showDemo);
biobioTab.addEventListener("click", showBiobio);
metroTab.addEventListener("click", showMetropolitana);
yumbelTab.addEventListener("click", showYumbel);
terrainReset.addEventListener("click", () => { state.camera = { yaw: -0.62, pitch: 0.62 }; drawTerrain(); });
prcLayerToggle.addEventListener("click", () => { state.showPrcConstraints = !state.showPrcConstraints; render(); });
terrainCanvas.addEventListener("pointerdown", (event) => { state.drag = { x: event.clientX, y: event.clientY }; terrainCanvas.setPointerCapture(event.pointerId); });
terrainCanvas.addEventListener("pointermove", (event) => {
  if (!state.drag) return;
  state.camera.yaw -= (event.clientX - state.drag.x) * .008;
  state.camera.pitch = Math.max(.15, Math.min(1.15, state.camera.pitch + (event.clientY - state.drag.y) * .006));
  state.drag = { x: event.clientX, y: event.clientY };
  if (state.animationFrame) window.cancelAnimationFrame(state.animationFrame);
  state.animationFrame = window.requestAnimationFrame(() => {
    state.animationFrame = null;
    drawTerrain();
  });
});
terrainCanvas.addEventListener("pointerup", () => { state.drag = null; });
showYumbel();

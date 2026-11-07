import { createTerrainView, populationColor } from "./terrain-view.js";

const svgNs = "http://www.w3.org/2000/svg";
const network = document.querySelector("#network");
const terrainStage = document.querySelector("#terrain-3d");
const terrainReset = document.querySelector("#terrain-reset");
const terrainExaggeration = document.querySelector("#terrain-exaggeration");
const terrainOverlay = document.querySelector("#terrain-overlay");
const elevationGradient = document.querySelector("#elev-gradient");
const elevationRange = document.querySelector("#elev-range");
const populationGradient = document.querySelector("#pop-gradient");
const populationRange = document.querySelector("#pop-range");
const terrainNote = document.querySelector("#terrain-note");
const exaggerationWrap = document.querySelector("#terrain-exaggeration-wrap");
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
const terrainView = createTerrainView(terrainStage);

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
  showPrcConstraints: false,
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
  network.style.display = isTerrain ? "none" : "block";
  terrainStage.hidden = !isTerrain;
  terrainOverlay.hidden = !isTerrain;
  exaggerationWrap.hidden = !isTerrain;
  terrainReset.hidden = !isTerrain;
  mapLegend.hidden = isTerrain;
  mapLegend.style.display = isTerrain ? "none" : "flex";
  if (isTerrain) {
    try {
      terrainView.render(state);
      updateTerrainLegend();
    } catch (error) {
      sceneStatus.textContent = error.message;
    }
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
  if (state.view === "terrain") terrainView.update(state);
}

function play() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    setStep(steps.length - 1);
    return;
  }
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
  state.terrain = await loadTerrain("biobio");
  state.scenario = state.biobio;
  state.step = 0;
  if (state.terrain) {
    state.view = "terrain";
    sceneStatus.textContent = state.scenario.name;
  } else {
    state.view = "map";
    sceneStatus.textContent = `${state.scenario.name} · sin terrain.json (regenera el piloto)`;
  }
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
  state.terrain = await loadTerrain("metropolitana");
  state.scenario = state.metropolitana;
  state.step = 0;
  if (state.terrain) {
    state.view = "terrain";
    sceneStatus.textContent = state.scenario.name;
  } else {
    state.view = "map";
    sceneStatus.textContent = `${state.scenario.name} · sin terrain.json (regenera el piloto)`;
  }
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
  sceneStatus.textContent = "Yumbel 50 km · PRC + clases de potencia · arrastra para rotar";
  setActiveTab("yumbel");
  render();
}

function updateTerrainLegend() {
  const terrain = state.terrain;
  if (!terrain || !terrain.palette || state.view !== "terrain") {
    terrainOverlay.hidden = true;
    return;
  }
  terrainOverlay.hidden = false;
  const stops = terrain.palette.stops;
  elevationGradient.style.background = `linear-gradient(90deg, ${stops
    .map((stop, index) => `${stop.hex} ${((index / (stops.length - 1)) * 100).toFixed(1)}%`)
    .join(", ")})`;
  elevationRange.textContent = `${Math.round(terrain.elevation_min_m)}–${Math.round(terrain.elevation_max_m)} m`;
  populationGradient.style.background = `linear-gradient(90deg, ${[0, 0.45, 1]
    .map((position) => {
      const [red, green, blue] = populationColor(position);
      return `rgb(${red}, ${green}, ${blue}) ${position * 100}%`;
    })
    .join(", ")})`;
  const populations = state.scenario.localityPolygons.map((locality) => locality.population);
  populationRange.textContent = populations.length
    ? `${Math.round(Math.min(...populations))}–${Math.round(Math.max(...populations))} hab.`
    : "";
  const [left, bottom, right, top] = terrain.bounds_metric_m || [0, 0, 0, 0];
  const km = (value) => new Intl.NumberFormat("es-CL", { maximumFractionDigits: 1 }).format(value / 1000);
  const notes = [
    `Este: 0-${km(right - left)} km · Norte: 0-${km(top - bottom)} km`,
    `Relieve vertical ×${terrainView.exaggeration}`,
  ];
  if (state.scenario.roads?.length) notes.push("© OpenStreetMap contributors");
  const exclusions = prcExclusions();
  if (exclusions.length) notes.push(`PRC: ${exclusions.length} exclusiones (screening, no permiso)`);
  terrainNote.textContent = notes.join(" · ");
}

previousButton.addEventListener("click", () => { stop(); setStep(state.step - 1); });
nextButton.addEventListener("click", () => { stop(); setStep(state.step + 1); });
playButton.addEventListener("click", play);
demoTab.addEventListener("click", showDemo);
biobioTab.addEventListener("click", showBiobio);
metroTab.addEventListener("click", showMetropolitana);
yumbelTab.addEventListener("click", showYumbel);
terrainReset.addEventListener("click", () => terrainView.reset());
prcLayerToggle.addEventListener("click", () => {
  state.showPrcConstraints = !state.showPrcConstraints;
  updatePrcLayerToggle();
  if (state.view === "terrain") terrainView.update(state);
  else render();
});
terrainExaggeration.addEventListener("change", () => {
  terrainView.setExaggeration(Number(terrainExaggeration.value));
  if (state.view === "terrain") render();
});
showYumbel();

"use strict";

const DATA = "../outputs/biobio-regresion-esu/";
const svgNs = "http://www.w3.org/2000/svg";
const map = document.querySelector("#map");
const status = document.querySelector("#map-status");
const playButton = document.querySelector("#play-button");
const nextButton = document.querySelector("#next-button");
const resetButton = document.querySelector("#reset-button");
const state = { step: 0, timer: null, scenario: null, elements: { localities: new Map(), candidates: new Map() } };

function element(name, attributes = {}) {
  const node = document.createElementNS(svgNs, name);
  Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
  return node;
}

function formatPopulation(value) { return new Intl.NumberFormat("es-CL").format(Math.round(value)); }
function formatPercent(value) { return new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 }).format(value) + "%"; }

function project(bounds, coordinate) {
  const [west, south, east, north] = bounds;
  const [longitude, latitude] = coordinate;
  const padding = 54;
  const width = 1000 - padding * 2;
  const height = 760 - padding * 2;
  return [padding + ((longitude - west) / (east - west)) * width, padding + ((north - latitude) / (north - south)) * height];
}

function geometryPath(geometry, bounds) {
  const rings = geometry.type === "Polygon" ? geometry.coordinates : geometry.coordinates.flat();
  return rings.map((ring) => ring.map((point, index) => {
    const [x, y] = project(bounds, point);
    return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ") + " Z").join(" ");
}

function gainFor(graph, candidate, covered) {
  const demandIds = graph.coverage[candidate.properties.id] || [];
  const newlyCovered = demandIds.filter((id) => !covered.has(id));
  const population = newlyCovered.reduce((sum, id) => sum + graph.population[id], 0);
  return { newlyCovered, population };
}

function createScenario([demand, demandPoints, candidates, area, graph, metrics, manifest]) {
  const bounds = manifest.study_bounds_wgs84;
  const candidateById = new Map(candidates.features.map((feature) => [feature.properties.id, feature]));
  const selected = metrics.results[0].selected.map((id) => candidateById.get(id));
  const selections = [];
  const covered = new Set();
  selected.forEach((candidate) => {
    const gain = gainFor(graph, candidate, covered);
    gain.newlyCovered.forEach((id) => covered.add(id));
    selections.push({ candidate, ...gain, totalPopulation: [...covered].reduce((sum, id) => sum + graph.population[id], 0), totalCovered: new Set(covered) });
  });
  return { demand, demandPoints, candidates, area, graph, metrics: metrics.results[0], bounds, selections };
}

function renderMap() {
  map.replaceChildren();
  const { scenario } = state;
  const boundary = scenario.area.features[0].geometry;
  map.append(element("path", { class: "area", d: geometryPath(boundary, scenario.bounds) }));

  const localityGroup = element("g", { "aria-label": "Localidades" });
  scenario.demandPoints.features.forEach((feature) => {
    const [x, y] = project(scenario.bounds, feature.geometry.coordinates);
    const population = feature.properties.population;
    const circle = element("circle", { class: "locality", cx: x, cy: y, r: Math.max(3.5, Math.min(10, 3 + Math.sqrt(population) / 3)), "data-id": feature.properties.id });
    const title = element("title");
    title.textContent = `Localidad ${feature.properties.id}: ${formatPopulation(population)} habitantes`;
    circle.append(title); localityGroup.append(circle); state.elements.localities.set(feature.properties.id, circle);
  });
  map.append(localityGroup);

  const candidateGroup = element("g", { "aria-label": "Candidatos de antena" });
  scenario.candidates.features.forEach((feature) => {
    const [x, y] = project(scenario.bounds, feature.geometry.coordinates);
    const circle = element("circle", { class: "candidate", cx: x, cy: y, r: 6, "data-id": feature.properties.id });
    const title = element("title");
    title.textContent = `Candidato ${feature.properties.id}, elevación ${formatPopulation(feature.properties.elevation)} m`;
    circle.append(title); candidateGroup.append(circle); state.elements.candidates.set(feature.properties.id, circle);
  });
  map.append(candidateGroup);
  const label = element("text", { class: "map-label", x: 54, y: 722 });
  label.textContent = "Ventana piloto Biobío: aproximadamente 18 × 22 km";
  map.append(label);
}

function updatePanel() {
  const { scenario, step } = state;
  const active = step ? scenario.selections[step - 1] : null;
  const selectedIds = new Set(scenario.selections.slice(0, step).map(({ candidate }) => candidate.properties.id));
  const covered = active ? active.totalCovered : new Set();
  state.elements.localities.forEach((node, id) => node.classList.toggle("covered", covered.has(id)));
  state.elements.candidates.forEach((node, id) => {
    node.classList.toggle("selected", selectedIds.has(id));
    node.classList.toggle("active", Boolean(active && id === active.candidate.properties.id));
  });

  const population = active ? active.totalPopulation : 0;
  document.querySelector("#covered-population").textContent = `${formatPopulation(population)} habitantes`;
  document.querySelector("#coverage-percentage").textContent = formatPercent(100 * population / scenario.metrics.population_total);
  document.querySelector("#selected-count").textContent = `${step} de ${scenario.selections.length}`;
  document.querySelector("#covered-count").textContent = formatPopulation(covered.size);

  document.querySelector("#selection-name").textContent = active ? `Antena ${step}: ${active.candidate.properties.id}` : "Aún no se selecciona una antena";
  document.querySelector("#elevation-value").textContent = active ? `${formatPopulation(active.candidate.properties.elevation)} m` : "-";
  document.querySelector("#gain-value").textContent = active ? `${formatPopulation(active.population)} habitantes` : "-";
  document.querySelector("#new-localities-value").textContent = active ? formatPopulation(active.newlyCovered.length) : "-";
  document.querySelector("#step-copy").textContent = active
    ? `La antena ${step} incorpora ${formatPopulation(active.population)} habitantes que aún no estaban cubiertos.`
    : "Inicia la secuencia para ver cómo se acumula la cobertura sin duplicar población.";
  status.textContent = step === scenario.selections.length ? "Solución exacta completa" : `Selección ${step} de ${scenario.selections.length}`;
  nextButton.disabled = step === scenario.selections.length;
  resetButton.disabled = step === 0;
  playButton.disabled = false;
  playButton.textContent = state.timer ? "Pausar" : step === scenario.selections.length ? "Ver de nuevo" : "Reproducir";
}

function stop() { if (state.timer) { window.clearInterval(state.timer); state.timer = null; } }
function advance() { if (state.step < state.scenario.selections.length) state.step += 1; else stop(); updatePanel(); if (state.step === state.scenario.selections.length) stop(); }
function play() { if (state.timer) { stop(); updatePanel(); return; } if (state.step === state.scenario.selections.length) state.step = 0; advance(); state.timer = window.setInterval(advance, 1700); updatePanel(); }

async function loadPilot() {
  try {
    const paths = ["demand.geojson", "demand_points.geojson", "candidates.geojson", "study_area.geojson", "graph.json", "metrics.json", "manifest.json"];
    const responses = await Promise.all(paths.map(async (path) => {
      const response = await fetch(DATA + path);
      if (!response.ok) throw new Error(`No se pudo cargar ${path}`);
      return response.json();
    }));
    state.scenario = createScenario(responses); renderMap(); updatePanel(); status.textContent = "Resultados Biobío cargados";
  } catch (error) {
    status.textContent = "No fue posible cargar el piloto";
    document.querySelector("#step-copy").textContent = "Sirve la carpeta simulacion por HTTP y verifica outputs/biobio-regresion-esu/.";
    document.querySelector("#selection-name").textContent = "Resultados no disponibles";
    console.error(error);
  }
}

playButton.addEventListener("click", play);
nextButton.addEventListener("click", () => { stop(); advance(); });
resetButton.addEventListener("click", () => { stop(); state.step = 0; updatePanel(); });
loadPilot();

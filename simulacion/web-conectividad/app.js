import {
  COVERAGE_STATES,
  COVERAGE_STATE_COLORS,
  coverageStatus,
  createTerrainView,
  rangeRing,
} from "./terrain-view.js";

const svgNs = "http://www.w3.org/2000/svg";
const network = document.querySelector("#network");
const terrainStage = document.querySelector("#terrain-3d");
const terrainReset = document.querySelector("#terrain-reset");
const terrainOverlay = document.querySelector("#terrain-overlay");
const elevationGradient = document.querySelector("#elev-gradient");
const elevationTicks = document.querySelector("#elev-ticks");
const populationClasses = document.querySelector("#pop-classes");
const populationStates = document.querySelector("#pop-states");
const populationStatesBar = document.querySelector("#pop-states-bar");
const terrainNote = document.querySelector("#terrain-note");
const prcLayerToggle = document.querySelector("#prc-layer-toggle");
const constraintToggle = document.querySelector("#constraint-toggle");
const constraintDrawer = document.querySelector("#constraint-drawer");
const constraintClose = document.querySelector("#constraint-close");
const constraintList = document.querySelector("#constraint-list");
const zoomControls = document.querySelector("#zoom-controls");
const zoomInButton = document.querySelector("#zoom-in");
const zoomOutButton = document.querySelector("#zoom-out");
const algorithmSteps = document.querySelector("#algorithm-steps");
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
    terrainCopy: "Cada disco es el rango nominal ρ(a) de una antena candidata, drapeado sobre el relieve. Los bordes de localidad iluminados marcan las alcanzables por distancia y línea de vista.",
  },
  {
    title: "Solución conectada",
    copy: "Se eligen hasta k antenas que cubren la mayor población posible y forman una sola red.",
    terrainCopy: "Las antenas elegidas muestran su rango ρ(a): el anillo y el disco drapeados siguen el terreno. Juntas cubren la mayor población posible en una sola red.",
  },
];

const state = {
  scenario: demo,
  biobio: null,
  metropolitana: null,
  yumbel: null,
  terrain: null,
  view: "diagram",
  // Restricciones PRC visibles por defecto en todas las simulaciones
  // (screening territorial: parte del problema y del motor).
  showPrcConstraints: true,
  step: 0,
  timer: null,
  elements: { demands: new Map(), candidates: new Map(), coverage: [], links: [] },
  // Carta de restricciones (ADR 0015): hover/focus ilumina la restricción en
  // el mapa; click la fija (útil en pantalla táctil).
  drawerOpen: false,
  hoverHighlight: null,
  highlightPinned: null,
  highlight: null,
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
  renderAlgorithmSection();
  renderConstraintDrawer();
  updatePrcLayerToggle();
  network.hidden = isTerrain;
  network.style.display = isTerrain ? "none" : "block";
  terrainStage.hidden = !isTerrain;
  terrainOverlay.hidden = !isTerrain;
  terrainReset.hidden = !isTerrain;
  zoomControls.hidden = !isTerrain;
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
  state.elements = {
    demands: new Map(),
    candidates: new Map(),
    coverage: [],
    links: [],
    area: null,
    prcPaths: { excluded: [], unknown: [] },
    proximityRings: [],
    rhoRings: [],
    rejections: { slope: [], nodata: [] },
    excluded: { prc: [], sensitive: [] },
  };
  if (state.scenario.mapGeometry) {
    const mapGroup = node("g", { "aria-label": "Mapa territorial" });
    const areaPath = node("path", { class: "study-area", d: state.scenario.mapGeometry.area });
    mapGroup.append(areaPath);
    state.elements.area = areaPath;
    state.scenario.mapGeometry.localities.forEach((path) => mapGroup.append(node("path", { class: "locality-area", d: path })));
    network.append(mapGroup);
    renderPrcConstraints();
    renderProximityRings();
    renderRhoRings();
    renderRejections();
    renderExcludedCandidates();
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
  const zones = (state.scenario.constraints || []).length;
  const exclusions = prcExclusions().length;
  const available = zones > 0;
  prcLayerToggle.hidden = !available;
  prcLayerToggle.setAttribute("aria-pressed", String(state.showPrcConstraints));
  prcLayerToggle.textContent = exclusions > 0
    ? `Restricciones PRC (${exclusions} exclusiones · ${zones} zonas)`
    : `Restricciones PRC (${zones} zonas sin clasificación)`;
}

function renderPrcConstraints() {
  const group = node("g", { class: "prc-exclusions", "aria-label": "Restricciones territoriales explícitas del PRC" });
  (state.scenario.constraints || []).forEach((feature) => {
    const excluded = feature.properties.constraint_status === "excluded";
    const path = node("path", { class: excluded ? "prc-exclusion" : "prc-unknown", d: pathForGeometry(feature.geometry, state.scenario.project) });
    const title = node("title");
    const zone = feature.properties.prc_zone || feature.properties.prc_name || "zona restringida";
    title.textContent = excluded
      ? `Exclusión PRC: ${zone}`
      : `Zona PRC sin clasificación: ${zone}`;
    path.append(title);
    group.append(path);
    state.elements.prcPaths[excluded ? "excluded" : "unknown"].push(path);
  });
  network.append(group);
}

// Capas de la carta de restricciones (ADR 0015): ocultas por defecto; el
// hover/focus en una fila de la carta las ilumina (clase .hl). Punteros
// desactivados: no interceptan el mapa.
function renderProximityRings() {
  const separationM = state.scenario.stats?.candidateSeparationM;
  if (!separationM) return;
  const group = node("g", { class: "proximity-layer", "aria-hidden": "true" });
  state.scenario.candidates.forEach((candidate) => {
    const ring = rangeRing(candidate.longitude, candidate.latitude, separationM, 64);
    const path = node("path", { class: "proximity-ring", d: pathForGeometry({ type: "Polygon", coordinates: [ring] }, state.scenario.project) });
    group.append(path);
    state.elements.proximityRings.push(path);
  });
  network.append(group);
}

function renderRhoRings() {
  const radii = state.scenario.candidates.filter((candidate) => candidate.radiusM);
  if (!radii.length) return;
  const group = node("g", { class: "rho-layer", "aria-hidden": "true" });
  radii.forEach((candidate) => {
    const ring = rangeRing(candidate.longitude, candidate.latitude, candidate.radiusM, 96);
    const path = node("path", { class: "rho-ring", d: pathForGeometry({ type: "Polygon", coordinates: [ring] }, state.scenario.project) });
    group.append(path);
    state.elements.rhoRings.push(path);
  });
  network.append(group);
}

function renderRejections() {
  const features = state.scenario.rejections || [];
  if (!features.length) return;
  const group = node("g", { class: "rejections-layer", "aria-hidden": "true" });
  features.forEach((feature) => {
    const reason = feature.properties?.reason;
    if (reason !== "slope" && reason !== "nodata") return;
    const [longitude, latitude] = feature.geometry.coordinates;
    const point = state.scenario.project([longitude, latitude]);
    const dot = node("circle", { class: `rejection rejection-${reason}`, cx: point.x, cy: point.y, r: 2 });
    const title = node("title");
    title.textContent =
      reason === "slope"
        ? `Descartado: pendiente ${feature.properties.slope_deg?.toFixed(1)}° > ${state.scenario.stats?.maxSlopeDeg ?? "θ_max"}°`
        : "Descartado: DEM sin datos (NoData)";
    dot.append(title);
    group.append(dot);
    state.elements.rejections[reason].push(dot);
  });
  network.append(group);
}

function renderExcludedCandidates() {
  const features = state.scenario.excludedCandidates || [];
  if (!features.length) return;
  const group = node("g", { class: "excluded-layer", "aria-hidden": "true" });
  features.forEach((feature) => {
    const rule = feature.properties?.constraint_rule;
    if (rule !== "prc_hard_exclusion" && rule !== "sensitive_site_distance") return;
    const [longitude, latitude] = feature.geometry.coordinates;
    const point = state.scenario.project([longitude, latitude]);
    const key = rule === "prc_hard_exclusion" ? "prc" : "sensitive";
    const mark = node("circle", { class: `excluded-candidate excluded-${key}`, cx: point.x, cy: point.y, r: 5 });
    const title = node("title");
    title.textContent =
      rule === "prc_hard_exclusion"
        ? `Candidato excluido por PRC (${feature.properties.constraint_status === "excluded" ? "exclusión dura" : "modo estricto"})`
        : "Candidato excluido: establecimiento sensible (OGUC 116 bis E)";
    mark.append(title);
    group.append(mark);
    state.elements.excluded[key].push(mark);
  });
  network.append(group);
}

// ── Carta de restricciones aplicadas (ADR 0015) ──────────────────────────
// Una fila por restricción real de la simulación cargada: parámetros vivos
// del manifiesto, conteos del audit y la equivalencia matemática que aplica
// el motor. Hover/focus ilumina su representación en el mapa.

function constraintRows(scenario) {
  const rows = [];
  const stats = scenario.stats || null;
  let stage = 0;
  let lastStage = null;
  const stageLabel = (index) => `C<sub>${index}</sub>`;

  if (stats) {
    rows.push({ header: "Restricciones territoriales (candidatos)" });

    const areaStage = stage++;
    lastStage = stageLabel(areaStage);
    rows.push({
      id: "area",
      title: "Área de estudio",
      badge: "aplicada",
      meta: stats.studySizeM ? `ventana ${km(stats.studySizeM)} alrededor del centro` : "bbox regional",
      counts:
        stats.excludedOutsideArea != null
          ? `${number(stats.excludedOutsideArea)} puntos fuera del área`
          : null,
      formula: `${lastStage} = { p : p ∈ A }`,
      note: "Sólo los puntos dentro de la ventana A entran al criterio de candidatos.",
      mapKey: "area",
    });

    const demStage = stage++;
    const demStageLabel = stageLabel(demStage);
    lastStage = demStageLabel;
    rows.push({
      id: "slope",
      title: "Pendiente (constructabilidad)",
      badge: "aplicada",
      meta: stats.maxSlopeDeg != null ? `θ_max = ${stats.maxSlopeDeg}°` : null,
      counts: `${number(stats.excludedSlope ?? 0)} puntos descartados`,
      formula: `${demStageLabel} = { p ∈ ${stageLabel(areaStage)} : |∇z(p)| ≤ tan(θ_max) }`,
      note: "Sin sitios de antena en laderas más empinadas que θ_max.",
      mapKey: "slope",
    });
    rows.push({
      id: "nodata",
      title: "DEM sin datos (NoData)",
      badge: "aplicada",
      meta: stats.dem?.source ? `DEM ${stats.dem.source}` : null,
      counts: `${number(stats.excludedNodata ?? 0)} puntos descartados`,
      formula: `z(p) = NoData ⇒ p ∉ ${demStageLabel}`,
      note: "Una celda sin elevación no genera cobertura ni LOS (política no_coverage).",
      mapKey: "nodata",
    });

    if (stats.candidateSeparationM != null) {
      const proxStage = stage++;
      const proxLabel = stageLabel(proxStage);
      lastStage = proxLabel;
      rows.push({
        id: "proximity",
        title: "Separación mínima entre candidatos",
        badge: "aplicada",
        meta: `d_sep = ${km(stats.candidateSeparationM)}`,
        counts: `${number(stats.excludedProximity ?? 0)} puntos descartados`,
        formula: `${proxLabel} = { p : ‖p−q‖ ≥ d_sep ∀ q ∈ ${proxLabel} }`,
        note: "Selección voraz por puntaje w₁(p) = Σ<sub>u</sub> w<sub>u</sub>·𝟙[‖p−u‖ ≤ ρ_max]; evita duplicados de un clúster (ADR 0007).",
        mapKey: "proximity",
      });
    }

    if (stats.maxCandidates != null) {
      const capStage = stage++;
      const capLabel = stageLabel(capStage);
      lastStage = capLabel;
      rows.push({
        id: "cap",
        title: "Tope de candidatos",
        badge: "aplicada",
        meta: `N_max = ${number(stats.maxCandidates)}`,
        counts: `${number(stats.keptCandidates ?? scenario.candidates.length)} candidatos finales${stats.capped ? " · instancia recortada (top-N_max por w₁)" : ""}`,
        formula: `${capLabel} = top-N_max de ${stageLabel(capStage - 1)} por w₁(p), con |${capLabel}| ≤ N_max`,
        note: "Protección del presupuesto de pares LOS: la instancia no crece sin control.",
        mapKey: "cap",
      });
    }

    const prcZones = (scenario.constraints || []).length;
    const prcAvailable = stats.prcZonesAvailable ?? 0;
    if (prcZones) {
      const prcStage = stage++;
      const prcLabel = stageLabel(prcStage);
      const exclusions = prcExclusions().length;
      lastStage = prcLabel;
      rows.push({
        id: "prc-exclusion",
        title: "PRC: exclusiones duras (screening)",
        badge: "aplicada",
        meta: `modo ${stats.prcMode || "screening"} · ADR 0005`,
        counts: `${number(prcZones)} zonas · ${number(exclusions)} exclusiones duras · ${number(stats.prcAudit?.excluded ?? 0)} candidatos excluidos`,
        formula: `${prcLabel} = { p ∈ ${stageLabel(prcStage - 1)} : p ∉ Z_exc }`,
        note: "Z_exc: zonas Agua, AV, ZPD, ZRi, ZEH-2(c) o nombre ∝ {área verde, inundable, drenaje, riesgo, no edificable}.",
        mapKey: "prc-exclusion",
      });
      rows.push({
        id: "prc-unknown",
        title: "PRC: zonas sin clasificación",
        badge: "etiqueta",
        meta: "screening: sin clasificación ≠ prohibido",
        counts: `${number(prcZones)} zonas mapeadas · no filtran candidatos`,
        formula: `p ∈ Z_sin ⇒ p ∈ ${prcLabel} marcado “unknown” (no se retira)`,
        note: "El PRC filtra como screening territorial; jamás es permiso de construcción (ADR 0005).",
        mapKey: "prc-unknown",
      });
    } else if (prcAvailable) {
      rows.push({
        id: "prc-exclusion",
        title: "PRC: screening territorial",
        badge: "no aplicada",
        meta: "sin prc_directory en la config de esta corrida",
        counts: `${number(prcAvailable)} zonas disponibles en constraints.geojson · no filtran candidatos`,
        formula: `${lastStage} = ${lastStage} (sin paso PRC)`,
        note: "Capa versionada de una corrida previa: sin capa declarada en la config, no se aplica (ADR 0005: limitación de datos, nunca permiso).",
        mapKey: null,
      });
    }

    const sensitiveApplied = Boolean(stats.sensitiveAudit);
    rows.push({
      id: "sensitive",
      title: "Establecimientos sensibles (OGUC 116 bis E · Ley 20.599)",
      badge: sensitiveApplied ? "aplicada" : "sin capa",
      meta: sensitiveApplied
        ? `buffer d_E = ${number(stats.sensitiveAudit.bufferM)} m`
        : "capa no declarada en la configuración",
      counts: sensitiveApplied
        ? `${number(stats.sensitiveAudit.excluded)} candidatos excluidos`
        : "no filtra en esta simulación",
      formula: "p no instalable si d(p, E) < d_E, con d_E = max(4·h_ant, 50 m)",
      note: sensitiveApplied
        ? stats.sensitiveAudit.source
        : "Limitación de datos declarada: sin capa no hay autorización implícita (ADR 0005/0007).",
      mapKey: sensitiveApplied ? "sensitive" : null,
    });
  }

  rows.push({ header: "Restricciones del modelo (motor exacto)" });

  if (stats?.classes?.length) {
    rows.push({
      id: "classes",
      title: "Clases de potencia ρ(a)",
      badge: "aplicada",
      meta: stats.classes.map((klass) => `${klass.count} × ${km(klass.radius_m)} (${klass.name})`).join(" · "),
      counts:
        stats.maxDistanceM != null
          ? `excedentes → ρ_max = ${km(stats.maxDistanceM)}`
          : null,
      formula: "ρ(a) = radius_m(clase(a)); asignación determinista por id ascendente",
      note: "docs/referencias-potencia-antenas.md: potencia/radio verificados contra fuentes primarias.",
      mapKey: "ranges",
    });
  } else if (stats?.maxDistanceM != null) {
    rows.push({
      id: "classes",
      title: "Clases de potencia ρ(a)",
      badge: "aplicada",
      meta: `uniforme: ρ_max = ${km(stats.maxDistanceM)} (max_distance_m)`,
      formula: "ρ(a) = ρ_max ∀ a ∈ C",
      mapKey: "ranges",
    });
  }

  const coverageCounts = stats
    ? `${number(stats.coveragePairs)} pares factibles · ${number(stats.reachable)} localidades alcanzables`
    : `${number(Object.values(scenario.coverage).flat().length)} pares factibles · ${number(new Set(Object.values(scenario.coverage).flat()).size)} localidades alcanzables`;
  const demMeta = [];
  if (stats?.dem?.source) demMeta.push(`DEM ${stats.dem.source}`);
  if (stats?.dem?.resolutionM != null) demMeta.push(`celda ${stats.dem.resolutionM} m`);
  if (stats?.sampleStepM != null) demMeta.push(`paso LOS ≤ ${number(stats.sampleStepM)} m`);
  if (stats?.dem?.antennaHeightM != null) demMeta.push(`h_ant ${stats.dem.antennaHeightM} m`);
  if (stats?.dem?.receiverHeightM != null) demMeta.push(`h_rec ${stats.dem.receiverHeightM} m`);
  rows.push({
    id: "coverage",
    title: "Cobertura (distancia + línea de vista)",
    badge: "aplicada",
    meta: demMeta.length ? demMeta.join(" · ") : "diagrama didáctico",
    counts: coverageCounts,
    formula: "C(a) = { u ∈ L : ‖a−u‖ ≤ ρ(a) ∧ LOS(a,u) }",
    note: stats?.sampleStepM
      ? `LOS muestreada con paso ≤ ${number(stats.sampleStepM)} m (≤ ½ píxel del DEM); celda NoData ⇒ sin cobertura.`
      : "La unión — no la suma por antena — es el objetivo (comentario del profesor).",
    mapKey: "coverage",
  });

  const hasLinks = stats ? Boolean(stats.linkPairs) : Boolean(Object.values(scenario.connectivity).some((n) => n.length));
  rows.push({
    id: "links",
    title: "Conectividad de la red (LOS entre antenas)",
    badge: hasLinks ? "aplicada" : "sin datos",
    meta: "enlaces factibles entre pares con visibilidad",
    counts:
      stats?.linkPairs != null
        ? `${number(stats.linkPairs)} enlaces factibles`
        : hasLinks
          ? "grafo didáctico de enlaces"
          : "sin enlaces calculados",
    formula: "E_conn = { (a,a′) : LOS(a,a′) ∧ ‖a−a′‖ ≤ min(ρ_a, ρ_a′) }",
    note: "La solución debe formar una sola red: G[S] conexo (un único componente).",
    mapKey: hasLinks ? "links" : null,
  });

  if (stats?.thresholdPopulation != null) {
    rows.push({
      id: "threshold",
      title: "Umbral de población t",
      badge: "aplicada",
      meta: `t = ${number(stats.thresholdPopulation)} hab`,
      counts: null,
      formula: "f(S) = Σ<sub>u ∈ U(S)</sub> w<sub>u</sub> ≥ t, con U(S) = ∪<sub>a∈S</sub> C(a)",
      note: "El objetivo es la población única cubierta por la unión, nunca la suma por antena.",
      mapKey: "solution",
    });
  }

  rows.push({
    id: "k",
    title: "Presupuesto de antenas",
    badge: "aplicada",
    meta: `k = ${scenario.k}`,
    counts:
      stats?.keptCandidates != null
        ? `${number(stats.keptCandidates)} sitios disponibles para elegir`
        : `${scenario.candidates.length} sitios disponibles para elegir`,
    formula: "S ⊆ C, |S| ≤ k",
    mapKey: "solution",
  });

  if (stats) {
    const gateways = stats.gateways || [];
    rows.push({
      id: "gateway",
      title: "Gateway (salida a Internet)",
      badge: gateways.length ? "aplicada" : "no exigida",
      meta: gateways.length ? `G = { ${gateways.join(", ")} }` : "G = ∅",
      counts: gateways.length ? null : "cualquier antena puede actuar como gateway",
      formula: "S ∩ G ≠ ∅",
      note: "Con G vacío la restricción se satisface trivialmente (no hay salida exigida).",
      mapKey: null,
    });
    if (stats.maxEvaluations != null) {
      rows.push({
        id: "evaluations",
        title: "Presupuesto de evaluaciones",
        badge: "aplicada",
        meta: `E_max = ${number(stats.maxEvaluations)}`,
        counts:
          stats.evaluations != null
            ? `${number(stats.evaluations)} evaluaciones usadas`
            : null,
        formula: "|{ S visitados por la enumeración ESU }| ≤ E_max",
        note: "Protección de peor caso: si el presupuesto se excede, ExactLimitExceeded.",
        mapKey: null,
      });
    }
  }

  return rows;
}

function constraintRowElement(row) {
  if (row.header) {
    const heading = document.createElement("h3");
    heading.className = "constraint-group";
    heading.textContent = row.header;
    return heading;
  }
  const button = document.createElement("button");
  button.type = "button";
  button.className = [
    "constraint-row",
    row.mapKey ? "" : "no-map",
    state.highlightPinned && state.highlightPinned === row.mapKey ? "pinned" : "",
  ]
    .filter(Boolean)
    .join(" ");
  button.dataset.constraint = row.id;
  const badgeClass = {
    aplicada: "ok",
    etiqueta: "info",
    "no exigida": "off",
    "sin capa": "off",
    "sin datos": "off",
  }[row.badge] || "info";
  button.innerHTML = `
    <span class="constraint-top"><strong>${row.title}</strong><span class="constraint-badge ${badgeClass}">${row.badge}</span></span>
    ${row.meta ? `<span class="constraint-meta">${row.meta}</span>` : ""}
    ${row.counts ? `<span class="constraint-counts">${row.counts}</span>` : ""}
    <code class="constraint-formula">${row.formula}</code>
    ${row.note ? `<span class="constraint-note">${row.note}</span>` : ""}`;
  if (row.mapKey) {
    button.addEventListener("mouseenter", () => setHoverHighlight(row.mapKey));
    button.addEventListener("mouseleave", () => setHoverHighlight(null));
    button.addEventListener("focus", () => setHoverHighlight(row.mapKey));
    button.addEventListener("blur", () => setHoverHighlight(null));
    button.addEventListener("click", () => {
      state.highlightPinned = state.highlightPinned === row.mapKey ? null : row.mapKey;
      renderConstraintDrawer();
      refreshHighlight();
    });
  }
  return button;
}

function renderConstraintDrawer() {
  const rows = constraintRows(state.scenario);
  constraintToggle.hidden = false;
  constraintToggle.setAttribute("aria-expanded", String(state.drawerOpen));
  constraintDrawer.classList.toggle("open", state.drawerOpen);
  constraintList.replaceChildren(...rows.map(constraintRowElement));
}

function setHoverHighlight(mapKey) {
  state.hoverHighlight = mapKey;
  refreshHighlight();
}

function refreshHighlight() {
  state.highlight = state.highlightPinned || state.hoverHighlight;
  if (state.view === "terrain") terrainView.update(state);
  else update();
}

// Iluminación en el mapa SVG: cada restricción tiene una capa con clase .hl
// activa sólo mientras su fila está en hover/focus/fijada. Defensivo: puede
// correr antes del primer render() (vía renderAlgorithmSection → update).
function applyHighlightSvg() {
  const highlight = state.highlight;
  const elements = state.elements;
  elements.area?.classList.toggle("hl", highlight === "area");
  const prcPaths = elements.prcPaths || { excluded: [], unknown: [] };
  const proximityRings = elements.proximityRings || [];
  const rhoRings = elements.rhoRings || [];
  const rejections = elements.rejections || { slope: [], nodata: [] };
  const excluded = elements.excluded || { prc: [], sensitive: [] };
  const prcOn = state.showPrcConstraints;
  const showExcluded = prcOn && (!highlight || highlight === "prc-exclusion");
  const showUnknown = prcOn && (!highlight || highlight === "prc-unknown");
  prcPaths.excluded.forEach((path) => {
    path.classList.toggle("off", !showExcluded);
    path.classList.toggle("hl", highlight === "prc-exclusion");
  });
  prcPaths.unknown.forEach((path) => {
    path.classList.toggle("off", !showUnknown);
    path.classList.toggle("hl", highlight === "prc-unknown");
  });
  proximityRings.forEach((path) => path.classList.toggle("hl", highlight === "proximity"));
  rhoRings.forEach((path) => path.classList.toggle("hl", highlight === "ranges"));
  rejections.slope.forEach((dot) => dot.classList.toggle("hl", highlight === "slope"));
  rejections.nodata.forEach((dot) => dot.classList.toggle("hl", highlight === "nodata"));
  excluded.prc.forEach((mark) => mark.classList.toggle("hl", highlight === "prc-exclusion"));
  excluded.sensitive.forEach((mark) => mark.classList.toggle("hl", highlight === "sensitive"));
}

function update() {
  const showCandidates = state.step >= 1;
  const showCoverage = state.step >= 2;
  const showSolution = state.step === steps.length - 1;
  const highlight = state.highlight;
  // La carta de restricciones puede adelantar estados del modelo sin
  // cambiar el paso: "solution"/"threshold"/"links" muestran la solución,
  // "coverage" los pares factibles, "cap" todas las candidatas.
  const solutionActive =
    showSolution ||
    highlight === "solution" ||
    highlight === "threshold" ||
    highlight === "links";
  const selected = solutionActive ? new Set(state.scenario.connectedSolution) : new Set();
  const covered = solutionActive ? coveredBy(state.scenario.connectedSolution) : new Set();
  const reachable =
    showCoverage || highlight === "coverage"
      ? new Set(Object.values(state.scenario.coverage).flat())
      : new Set();

  state.elements.candidates.forEach(({ circle, label }, id) => {
    // En la solución sólo quedan las antenas elegidas; las candidatas
    // descartadas se remueven (misma regla que la escena 3D).
    const visible =
      (showCandidates || highlight === "cap" || highlight === "coverage" || highlight === "ranges") &&
      (!solutionActive || selected.has(id));
    circle.classList.toggle("show", visible);
    label.classList.toggle("show", visible);
    circle.classList.toggle("selected", selected.has(id));
  });
  state.elements.coverage.forEach(({ line }) => {
    line.classList.toggle("show", highlight === "coverage");
  });
  state.elements.links.forEach(({ line, source, target }) => {
    line.classList.toggle("show", solutionActive);
    line.classList.toggle("selected", solutionActive && selected.has(source) && selected.has(target));
  });
  state.elements.demands.forEach((circle, id) => {
    circle.classList.toggle("covered", covered.has(id));
    circle.classList.toggle("reachable", !covered.has(id) && reachable.has(id));
    // Sin alcance sólo se distingue en la solución: antes de ella no hay
    // nada que afirmar sobre la población no cubierta (ADR 0014).
    circle.classList.toggle("unreachable", showSolution && !reachable.has(id));
  });
  applyHighlightSvg();
  const totals = populationByState();
  document.querySelector("#uncovered-value").textContent = showSolution
    ? number(totals.reachable + totals.unreachable)
    : "—";
  document.querySelector("#uncovered-detail").textContent = showSolution
    ? `${number(totals.reachable)} alcanzable · ${number(totals.unreachable)} sin alcance`
    : "";

  const step = steps[state.step];
  document.querySelector("#step-index").textContent = `${state.step + 1} de ${steps.length}`;
  const noConnectivity = state.scenario.mapGeometry && !state.scenario.hasConnectivity && state.step >= 3;
  document.querySelector("#step-title").textContent = noConnectivity ? "Cobertura del piloto" : step.title;
  document.querySelector("#step-copy").textContent = noConnectivity
    ? "Este resultado existente muestra cobertura. Regenera el piloto con el pipeline actualizado para añadir enlaces entre antenas."
    : state.view === "terrain" && step.terrainCopy
      ? step.terrainCopy
      : step.copy;
  document.querySelector("#covered-value").textContent = showSolution ? number(population(covered)) : "0";
  document.querySelector("#selected-value").textContent = showSolution ? `${selected.size} de ${state.scenario.k}` : `0 de ${state.scenario.k}`;
  document.querySelector("#connected-value").textContent = noConnectivity
    ? "No calculado"
    : showSolution ? "Sí" : state.step >= 3 ? "Por verificar" : "Aún no aplica";
  previousButton.disabled = state.step === 0;
  nextButton.disabled = state.step === steps.length - 1;
  playButton.textContent = state.timer ? "Pausar" : state.step === steps.length - 1 ? "Ver de nuevo" : "Reproducir";
  document.querySelectorAll("#algorithm-steps .algorithm-card, #algorithm-model .model-row").forEach((card) => {
    card.classList.toggle("active", Number(card.dataset.step) === state.step);
  });
}

// Habitantes por estado de cobertura de la solución conectada (ADR 0014).
function populationByState() {
  const statusOf = coverageStatus(state.scenario, state.scenario.connectedSolution);
  const totals = Object.fromEntries(COVERAGE_STATES.map((key) => [key, 0]));
  state.scenario.demands.forEach((demand) => {
    totals[statusOf(demand.id)] += demand.population;
  });
  return totals;
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
  // La carta de restricciones es por escenario: al cambiar de simulación se
  // limpia cualquier iluminación fijada (los filtros aplicados cambian).
  state.highlightPinned = null;
  state.hoverHighlight = null;
  state.highlight = null;
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
      const response = await fetch(`../outputs/${directory}/${path}`, { cache: "no-cache" });
      if (!response.ok) throw new Error(path);
      return response.json();
    }));
    const [demand, demandPoints, candidates, area, graph, metrics] = responses;
    let connectivity = null;
    let roads = [];
    let constraints = [];
    let manifestConfig = null;
    let manifest = null;
    try {
      const response = await fetch(`../outputs/${directory}/connectivity.json`, { cache: "no-cache" });
      if (response.ok) connectivity = await response.json();
    } catch (_) { /* La conectividad es opcional. */ }
    try {
      const response = await fetch(`../outputs/${directory}/manifest.json`, { cache: "no-cache" });
      if (response.ok) {
        manifest = await response.json();
        manifestConfig = manifest.config || null;
      }
    } catch (_) { /* El manifiesto es opcional. */ }
    try {
      const response = await fetch(`../outputs/${directory}/roads.geojson`, { cache: "no-cache" });
      if (response.ok) {
        const mainRoads = new Set(["motorway", "trunk", "primary", "secondary", "tertiary"]);
        roads = (await response.json()).features.filter((road) => mainRoads.has(road.properties.highway));
      }
    } catch (_) { /* La capa OSM es opcional. */ }
    try {
      const response = await fetch(`../outputs/${directory}/constraints.geojson`, { cache: "no-cache" });
      if (response.ok) constraints = (await response.json()).features;
    } catch (_) { /* El filtro PRC es opcional. */ }
    // PRC sólo cuenta como aplicado si la corrida lo declaró (audit del
    // manifiesto o prc_directory en la config). Un constraints.geojson
    // heredado de una era anterior no se muestra ni se lista como aplicado:
    // screening honesto (ADR 0005).
    const prcZonesAvailable = constraints.length;
    const prcApplied = Boolean(manifest?.prc_constraints || manifestConfig?.prc_directory);
    if (!prcApplied) constraints = [];
    // Puntos descartados por filtros del DEM y candidatos excluidos por
    // restricciones territoriales: capas de la carta de restricciones
    // (ADR 0015). Opcionales: pilotos anteriores pueden no tenerlos.
    let rejections = [];
    let excludedCandidates = [];
    try {
      const response = await fetch(`../outputs/${directory}/candidate_rejections.geojson`, { cache: "no-cache" });
      if (response.ok) rejections = (await response.json()).features;
    } catch (_) { /* Requiere pipeline con exportación de rechazos. */ }
    try {
      const response = await fetch(`../outputs/${directory}/excluded_candidates.geojson`, { cache: "no-cache" });
      if (response.ok) excludedCandidates = (await response.json()).features;
    } catch (_) { /* Sin exclusiones PRC/sensibles no hay archivo. */ }
    const coordinates = demandPoints.features.map((feature) => feature.geometry.coordinates);
    const bounds = coordinates.reduce((value, [x, y]) => [Math.min(value[0], x), Math.min(value[1], y), Math.max(value[2], x), Math.max(value[3], y)], [Infinity, Infinity, -Infinity, -Infinity]);
    const project = ([x, y]) => ({ x: 42 + ((x - bounds[0]) / (bounds[2] - bounds[0])) * 636, y: 45 + ((bounds[3] - y) / (bounds[3] - bounds[1])) * 365 });
    const connectedResult = metrics.results.find((result) => result.algorithm === "exact_connected");
    const greedyResult = metrics.results.find((result) => result.algorithm === "greedy_connected");
    const coverageValues = Object.values(graph.coverage).flat();
    const candidateAudit = manifest?.candidates || {};
    const prcAudit = manifest?.prc_constraints || null;
    const sensitiveAudit = manifest?.sensitive_sites || null;
    return {
      name,
      k: metrics.results[0].k,
      stats: {
        candidates: candidates.features.length,
        localities: demandPoints.features.length,
        coveragePairs: coverageValues.length,
        reachable: new Set(coverageValues).size,
        evaluations: connectedResult?.evaluations ?? null,
        runtimeSeconds: connectedResult?.runtime_seconds ?? null,
        populationCovered: connectedResult?.population_covered ?? null,
        populationTotal: connectedResult?.population_total ?? null,
        linkPairs: connectivity ? Object.values(connectivity).reduce((sum, ids) => sum + ids.length, 0) / 2 : null,
        classes: manifestConfig?.antenna_classes?.length ? manifestConfig.antenna_classes : [],
        maxDistanceM: manifestConfig?.max_distance_m ?? null,
        thresholdPopulation: manifestConfig?.min_population ?? null,
        gateways: manifestConfig?.gateways ?? null,
        candidateSeparationM: manifestConfig?.candidate_separation_m ?? null,
        maxSlopeDeg: manifestConfig?.max_slope_deg ?? null,
        dem: manifestConfig
          ? {
              source: manifestConfig.dem_source ?? null,
              resolutionM: manifestConfig.dem_resolution_m ?? null,
              antennaHeightM: manifestConfig.antenna_height_m ?? null,
              receiverHeightM: manifestConfig.receiver_height_m ?? null,
            }
          : null,
        greedy: greedyResult
          ? {
              populationCovered: greedyResult.population_covered,
              evaluations: greedyResult.evaluations,
              runtimeSeconds: greedyResult.runtimeSeconds ?? greedyResult.runtime_seconds,
            }
          : null,
        // Carta de restricciones (ADR 0015): conteos y parámetros de cada
        // filtro, desde el audit y la config del manifiesto.
        studySizeM: manifestConfig?.study_size_m ?? null,
        prcMode: manifestConfig?.prc_mode ?? null,
        maxEvaluations: manifestConfig?.max_evaluations ?? null,
        sampleStepM: manifest?.model?.sample_step_m ?? null,
        rawPoints: candidateAudit.raw_points ?? null,
        keptCandidates: candidateAudit.kept ?? null,
        maxCandidates: candidateAudit.max_candidates ?? manifestConfig?.max_candidates ?? null,
        capped: candidateAudit.capped ?? null,
        excludedOutsideArea: candidateAudit.excluded_outside_area ?? null,
        excludedNodata: candidateAudit.excluded_nodata ?? null,
        excludedSlope: candidateAudit.excluded_slope ?? null,
        excludedProximity: candidateAudit.excluded_proximity ?? null,
        highsiteWindowM: candidateAudit.highsite_window_m ?? null,
        prcAudit: prcAudit
          ? {
              mode: prcAudit.mode ?? null,
              generated: prcAudit.generated ?? null,
              kept: prcAudit.kept ?? null,
              excluded: prcAudit.excluded ?? null,
            }
          : null,
        prcApplied,
        prcZonesAvailable,
        sensitiveAudit: sensitiveAudit
          ? {
              generated: sensitiveAudit.generated ?? null,
              kept: sensitiveAudit.kept ?? null,
              excluded: sensitiveAudit.excluded ?? null,
              bufferM: sensitiveAudit.buffer_m ?? null,
              source: sensitiveAudit.source ?? null,
            }
          : null,
        sensitiveConfigured: Boolean(manifestConfig?.sensitive_directory),
      },
      demands: demandPoints.features.map((feature) => ({ id: feature.properties.id, label: feature.properties.id, population: feature.properties.population, longitude: feature.geometry.coordinates[0], latitude: feature.geometry.coordinates[1], ...project(feature.geometry.coordinates) })),
      // Sólo candidatos vigentes: los excluidos por PRC/sensibles viven en
      // excluded_candidates.geojson y se dibujan como cruces de la carta.
      candidates: candidates.features.filter((feature) => feature.properties.constraint_status !== "excluded").map((feature) => ({ id: feature.properties.id, label: feature.properties.id, longitude: feature.geometry.coordinates[0], latitude: feature.geometry.coordinates[1], radiusM: feature.properties.radius_m ?? null, constraintStatus: feature.properties.constraint_status, ...project(feature.geometry.coordinates) })),
      coverage: graph.coverage,
      connectivity: Object.fromEntries(candidates.features.map((feature) => [feature.properties.id, connectivity?.[feature.properties.id] || []])),
      connectedSolution: (connectedResult || metrics.results[0]).selected,
      hasConnectivity: Boolean(connectivity && connectedResult),
      mapGeometry: { area: pathForGeometry(area.features[0].geometry, project), localities: demand.features.map((feature) => pathForGeometry(feature.geometry, project)) },
      project,
      localityPolygons: demand.features.map((feature) => ({ id: feature.properties.id, population: feature.properties.population, geometry: feature.geometry })),
      roads,
      constraints,
      rejections,
      excludedCandidates,
      areaGeometry: area.features[0].geometry,
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
    const response = await fetch(`../outputs/${directory}/terrain.json`, { cache: "no-cache" });
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
  // Ticks con los cortes reales de la rampa hipsométrica (m s. n. m.).
  elevationTicks.innerHTML = [0, 0.25, 0.5, 0.75, 1]
    .map((fraction) => {
      const stop = stops[Math.round(fraction * (stops.length - 1))];
      return `<span>${number(stop.limit_m)}</span>`;
    })
    .join("");
  // Rangos reales de cada clase de densidad (cuantiles hab/km²).
  const compact = new Intl.NumberFormat("es-CL", { notation: "compact", maximumFractionDigits: 1 });
  const classes = terrainView.densityClasses;
  populationClasses.innerHTML = classes
    .map((klass) => {
      const color = `rgb(${klass.color.join(", ")})`;
      const range = `${compact.format(klass.min)}–${compact.format(klass.max)}`;
      return `<span class="legend-class"><i class="legend-swatch" style="background: ${color}"></i><b>${range}</b></span>`;
    })
    .join("");
  // Población afectada vs no afectada: tres estados y barra apilada en
  // proporción a habitantes (ADR 0014). Mismos colores que las esferas 3D.
  const totals = populationByState();
  const total = COVERAGE_STATES.reduce((sum, key) => sum + totals[key], 0);
  const labels = { covered: "Cubierta", reachable: "Alcanzable", unreachable: "Sin alcance" };
  const percent = new Intl.NumberFormat("es-CL", { style: "percent", maximumFractionDigits: 1 });
  populationStates.innerHTML = COVERAGE_STATES.map((key) => {
    const share = total ? percent.format(totals[key] / total) : "—";
    return `<span class="legend-class" title="${number(totals[key])} hab"><i class="legend-swatch" style="background: ${COVERAGE_STATE_COLORS[key]}"></i><b>${labels[key]}</b><b>${share}</b></span>`;
  }).join("");
  populationStatesBar.innerHTML = total
    ? COVERAGE_STATES.filter((key) => totals[key] > 0)
        .map((key) => `<i style="flex-grow: ${totals[key]}; background: ${COVERAGE_STATE_COLORS[key]}"></i>`)
        .join("")
    : "";
  const [left, bottom, right, top] = terrain.bounds_metric_m || [0, 0, 0, 0];
  const km = (value) => new Intl.NumberFormat("es-CL", { maximumFractionDigits: 1 }).format(value / 1000);
  const notes = [`Este: 0-${km(right - left)} km · Norte: 0-${km(top - bottom)} km · Relieve ×2,5 (misma exageración del hillshade) · Torre 30 m a escala`];
  if (state.scenario.roads?.length) notes.push("© OpenStreetMap contributors");
  const exclusions = prcExclusions();
  if (exclusions.length) notes.push(`PRC: ${exclusions.length} exclusiones (screening, no permiso)`);
  terrainNote.textContent = notes.join(" · ");
}

// Sección "Cómo se aplicó el algoritmo": cuatro fases con los números reales
// del escenario cargado; cada tarjeta sincroniza el mapa con su fase.
const algorithmCards = [
  {
    step: 1,
    title: "1 · Candidatos",
    detail: (stats) => stats
      ? `${number(stats.candidates)} sitios del criterio territorial (anclas en localidades, intersecciones Murray–Tong y sitios altos) para ${number(stats.localities)} localidades.`
      : "El criterio territorial propone sitios: anclas en localidades, intersecciones de cobertura y sitios altos del relieve.",
  },
  {
    step: 2,
    title: "2 · Cobertura posible",
    detail: (stats) => stats
      ? `${number(stats.coveragePairs)} pares localidad–antena factibles por distancia y línea de vista sobre el DEM; ${number(stats.reachable)} localidades alcanzables por al menos una candidata.`
      : "Localidades alcanzables por al menos una candidata, filtradas por distancia y línea de vista.",
  },
  {
    step: 3,
    title: "3 · Selección exacta",
    detail: (stats) => stats && stats.evaluations != null
      ? `Motor conectado (ESU + unión incremental + cotas): ${number(stats.evaluations)} evaluaciones en ${fmtSeconds(stats.runtimeSeconds)} s. Máxima población única cubierta: ${number(stats.populationCovered)} hab.`
      : "Enumeración canónica de subconjuntos conexos con cota de prefijos y unión incremental del objetivo.",
  },
  {
    step: 3,
    title: "4 · Red conectada",
    detail: (stats) => {
      const base = "Las antenas elegidas forman un único componente: gateway y enlaces LOS entre pares con visibilidad.";
      if (!stats?.greedy) return `${base} El baseline goloso se registra al correr el pipeline.`;
      const igual = stats.greedy.populationCovered === stats.populationCovered;
      return `${base} Baseline goloso: ${number(stats.greedy.populationCovered)} hab en ${fmtSeconds(stats.greedy.runtimeSeconds)} s (${igual ? "coincide con el óptimo" : "bajo el óptimo"}).`;
    },
  },
];

function fmtSeconds(value) {
  if (value == null) return "—";
  return new Intl.NumberFormat("es-CL", { maximumFractionDigits: 1 }).format(value);
}

// Valores vivos del panel "Elementos del modelo → datos reales": cada chip
// toma los números del escenario cargado; sin datos, el chip se oculta.
const liveChips = {
  localities: (stats) =>
    stats && `${number(stats.localities)} localidades · ${number(stats.populationTotal)} hab`,
  candidates: (stats) => stats && `${number(stats.candidates)} sitios`,
  filters: (stats) => {
    if (!stats) return null;
    const parts = [];
    if (stats.candidateSeparationM != null) parts.push(`separación ≥ ${km(stats.candidateSeparationM)}`);
    if (stats.maxSlopeDeg != null) parts.push(`pendiente ≤ ${fmtSeconds(stats.maxSlopeDeg)}°`);
    return parts.join(" · ") || null;
  },
  rho: (stats) => {
    if (!stats) return null;
    if (stats.classes.length) {
      return stats.classes.map((klass) => `${klass.count} × ${km(klass.radius_m)} (${klass.name})`).join(" · ");
    }
    return stats.maxDistanceM != null ? `uniforme: ${km(stats.maxDistanceM)} (max_distance_m)` : null;
  },
  los: (stats) => {
    if (!stats?.dem) return null;
    const { source, resolutionM, antennaHeightM, receiverHeightM } = stats.dem;
    const parts = [`DEM ${source || "—"}`];
    if (resolutionM != null) parts.push(`celda ${fmtSeconds(resolutionM)} m`);
    if (antennaHeightM != null) parts.push(`h antena ${fmtSeconds(antennaHeightM)} m`);
    if (receiverHeightM != null) parts.push(`h receptor ${fmtSeconds(receiverHeightM)} m`);
    return parts.join(" · ");
  },
  coverage: (stats) =>
    stats && `${number(stats.coveragePairs)} pares factibles · ${number(stats.reachable)} localidades alcanzables`,
  links: (stats) => stats?.linkPairs != null && `${number(stats.linkPairs)} enlaces factibles`,
  params: (stats, scenario) => {
    const parts = [`k = ${scenario.k}`];
    if (stats?.thresholdPopulation != null) parts.push(`t = ${number(stats.thresholdPopulation)} hab`);
    parts.push(`G = ${stats?.gateways?.length ? stats.gateways.join(", ") : "∅"}`);
    return parts.join(" · ");
  },
  result: (stats) => {
    if (!stats || stats.evaluations == null) return null;
    const pct = stats.populationTotal
      ? ` (${new Intl.NumberFormat("es-CL", { style: "percent", maximumFractionDigits: 1 }).format(stats.populationCovered / stats.populationTotal)})`
      : "";
    const greedy = stats.greedy
      ? ` · goloso: ${number(stats.greedy.evaluations)} eval en ${fmtSeconds(stats.greedy.runtimeSeconds)} s`
      : "";
    return `f(S) = ${number(stats.populationCovered)} hab${pct} · ${number(stats.evaluations)} eval · ${fmtSeconds(stats.runtimeSeconds)} s${greedy}`;
  },
};

function km(meters) {
  return `${new Intl.NumberFormat("es-CL", { maximumFractionDigits: 1 }).format(meters / 1000)} km`;
}

function renderAlgorithmSection() {
  const stats = state.scenario.stats || null;
  algorithmSteps.replaceChildren();
  algorithmCards.forEach((card) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "algorithm-card";
    button.dataset.step = String(card.step);
    button.innerHTML = `<strong>${card.title}</strong><span>${card.detail(stats)}</span>`;
    button.addEventListener("click", () => {
      stop();
      setStep(card.step);
    });
    algorithmSteps.append(button);
  });
  document.querySelectorAll("#algorithm-model .model-row").forEach((row) => {
    row.addEventListener("click", () => {
      stop();
      setStep(Number(row.dataset.step));
    });
  });
  document.querySelectorAll("#algorithm-model [data-live]").forEach((chip) => {
    const fill = liveChips[chip.dataset.live];
    const value = fill ? fill(stats, state.scenario) : null;
    chip.hidden = !value;
    chip.textContent = value || "";
  });
  update();
}

previousButton.addEventListener("click", () => { stop(); setStep(state.step - 1); });
nextButton.addEventListener("click", () => { stop(); setStep(state.step + 1); });
playButton.addEventListener("click", play);
demoTab.addEventListener("click", showDemo);
biobioTab.addEventListener("click", showBiobio);
metroTab.addEventListener("click", showMetropolitana);
yumbelTab.addEventListener("click", showYumbel);
terrainReset.addEventListener("click", () => terrainView.reset());
zoomInButton.addEventListener("click", () => terrainView.zoomIn());
zoomOutButton.addEventListener("click", () => terrainView.zoomOut());
prcLayerToggle.addEventListener("click", () => {
  state.showPrcConstraints = !state.showPrcConstraints;
  updatePrcLayerToggle();
  if (state.view === "terrain") terrainView.update(state);
  else render();
});
constraintToggle.addEventListener("click", () => {
  setDrawer(!state.drawerOpen);
});
constraintClose.addEventListener("click", () => setDrawer(false));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.drawerOpen) setDrawer(false);
});

function setDrawer(open) {
  state.drawerOpen = open;
  constraintDrawer.classList.toggle("open", open);
  constraintToggle.setAttribute("aria-expanded", String(open));
}
showYumbel();

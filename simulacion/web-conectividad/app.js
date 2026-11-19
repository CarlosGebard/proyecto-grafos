// Visor de cobertura territorial conectada. Flujo: inicio (problema +
// solución) → mapa de Chile con las localidades de los tres pilotos →
// simulación 3D de la zona (three.js vendido, sin build ni red: ADR 0008).
// La enumeración del motor no vive aquí; el visor sólo comunica los
// artefactos versionados de simulacion/outputs/ (ADR 0003).

import {
  COVERAGE_STATES,
  COVERAGE_STATE_COLORS,
  coverageStatus,
  createTerrainView,
} from "./terrain-view.js";
import { ZONES, NACIONAL } from "./zones.js";
import { createChileMap } from "./map.js";

const terrainStage = document.querySelector("#terrain-3d");
const terrainOverlay = document.querySelector("#terrain-overlay");
const elevationGradient = document.querySelector("#elev-gradient");
const elevationTicks = document.querySelector("#elev-ticks");
const populationClasses = document.querySelector("#pop-classes");
const populationStates = document.querySelector("#pop-states");
const populationStatesBar = document.querySelector("#pop-states-bar");
const terrainNote = document.querySelector("#terrain-note");
const constraintToggle = document.querySelector("#constraint-toggle");
const constraintDrawer = document.querySelector("#constraint-drawer");
const constraintClose = document.querySelector("#constraint-close");
const constraintList = document.querySelector("#constraint-list");
const zoomInButton = document.querySelector("#zoom-in");
const zoomOutButton = document.querySelector("#zoom-out");
const algorithmSteps = document.querySelector("#algorithm-steps");
const previousButton = document.querySelector("#previous-button");
const nextButton = document.querySelector("#next-button");
const playButton = document.querySelector("#play-button");
const resetButton = document.querySelector("#reset-button");
const sceneStatus = document.querySelector("#scene-status");
const simName = document.querySelector("#sim-name");
const viewInicio = document.querySelector("#view-inicio");
const viewMapa = document.querySelector("#view-mapa");
const viewSim = document.querySelector("#view-sim");
const viewFade = document.querySelector("#view-fade");
const zoneCard = document.querySelector("#zone-card");
const zoneCta = document.querySelector("#zone-cta");
const terrainView = createTerrainView(terrainStage);

const steps = [
  {
    title: "Localidades y población",
    copy: "Cada círculo es una localidad. Su tamaño muestra cuántas personas se busca cubrir.",
    terrainCopy: "Las esferas marcan localidades (tamaño ∝ √población) sobre la coropleta de densidad drapeada al relieve.",
  },
  {
    title: "Posiciones candidatas",
    copy: "El criterio territorial propone sitios: anclas en localidades, intersecciones de cobertura y sitios altos del relieve. Todavía no sabemos cuáles conviene elegir.",
    terrainCopy: "Las torres candidatas aparecen sobre el relieve: anclas en localidades, intersecciones Murray–Tong y sitios altos del DEM.",
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
  scenario: null,
  scenarios: new Map(),
  terrains: new Map(),
  terrain: null,
  view: "terrain",
  activeZone: null,
  // Restricciones PRC visibles por defecto en todas las simulaciones
  // (screening territorial: parte del problema y del motor).
  showPrcConstraints: true,
  step: 0,
  timer: null,
  // Carta de restricciones (ADR 0015): hover/focus ilumina la restricción en
  // el mapa; click la fija (útil en pantalla táctil).
  drawerOpen: false,
  hoverHighlight: null,
  highlightPinned: null,
  highlight: null,
};

function number(value) {
  return new Intl.NumberFormat("es-CL").format(Math.round(value));
}

// Coordenadas en formato cartográfico: -37.128 → «37°08′S · 72°33′O».
function formatCoord([lon, lat]) {
  const fmt = (value, pos, neg) => {
    const absolute = Math.abs(value);
    const degrees = Math.floor(absolute);
    const minutes = Math.round((absolute - degrees) * 60);
    const clamped = minutes === 60 ? degrees + 1 : degrees;
    const shown = minutes === 60 ? 0 : minutes;
    return `${clamped}°${String(shown).padStart(2, "0")}′${value >= 0 ? pos : neg}`;
  };
  return `${fmt(lat, "N", "S")} · ${fmt(lon, "E", "O")}`;
}

// Haz de rayos decorativo de la portada: líneas radiales deterministas
// (mismo trazo en cada carga; sin dependencias).
function mountRayBursts() {
  document.querySelectorAll("svg.rayburst").forEach((svg) => {
    const rays = Number(svg.dataset.rays || 48);
    const ns = "http://www.w3.org/2000/svg";
    svg.setAttribute("viewBox", "-110 -110 220 220");
    for (let i = 0; i < rays; i += 1) {
      const angle = (i / rays) * Math.PI * 2;
      const inner = 28 + ((i * 37) % 34);
      const line = document.createElementNS(ns, "line");
      line.setAttribute("x1", (Math.cos(angle) * inner).toFixed(2));
      line.setAttribute("y1", (Math.sin(angle) * inner).toFixed(2));
      line.setAttribute("x2", (Math.cos(angle) * 106).toFixed(2));
      line.setAttribute("y2", (Math.sin(angle) * 106).toFixed(2));
      line.setAttribute("stroke", "currentColor");
      line.setAttribute("stroke-width", "0.9");
      svg.appendChild(line);
    }
  });
}

function prcExclusions() {
  return (state.scenario.constraints || []).filter(
    (feature) => feature.properties.constraint_status === "excluded"
  );
}

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
// ── Recorrido de pasos y lectura del estado ──────────────────────────────
// La vista es siempre la escena 3D (los tres pilotos tienen terrain.json);
// update() refresca el overlay de lectura y sincroniza la sección inferior.

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

  const totals = populationByState();
  document.querySelector("#uncovered-value").textContent = showSolution
    ? number(totals.reachable + totals.unreachable)
    : "—";
  document.querySelector("#uncovered-detail").textContent = showSolution
    ? `${number(totals.reachable)} alcanzable · ${number(totals.unreachable)} sin alcance`
    : "";

  const step = steps[state.step];
  document.querySelector("#step-index").textContent = `${state.step + 1} de ${steps.length}`;
  const noConnectivity = !state.scenario.hasConnectivity && state.step >= 3;
  document.querySelector("#step-title").textContent = noConnectivity ? "Cobertura del piloto" : step.title;
  document.querySelector("#step-copy").textContent = noConnectivity
    ? "Este resultado existente muestra cobertura. Regenera el piloto con el pipeline actualizado para añadir enlaces entre antenas."
    : step.terrainCopy || step.copy;
  const selectedCount = state.scenario.connectedSolution.length;
  document.querySelector("#covered-value").textContent = showSolution
    ? number(state.scenario.stats?.populationCovered ?? 0)
    : "0";
  document.querySelector("#selected-value").textContent = showSolution
    ? `${selectedCount} de ${state.scenario.k}`
    : `0 de ${state.scenario.k}`;
  document.querySelector("#connected-value").textContent = noConnectivity
    ? "No calculado"
    : showSolution ? "Sí" : state.step >= 3 ? "Por verificar" : "Aún no aplica";
  previousButton.disabled = state.step === 0;
  nextButton.disabled = state.step === steps.length - 1;
  playButton.textContent = state.timer
    ? "Pausar"
    : state.step === steps.length - 1 ? "Ver de nuevo" : "Iniciar simulación";
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
  terrainView.update(state);
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

// Reinicio completo de la visualización: paso inicial y cámara al encuadre
// original (el botón «Reiniciar» de los controles superiores).
function resetSimulation() {
  stop();
  setStep(0);
  terrainView.reset();
}

// ── Carga de escenarios (corridas versionadas de outputs/, ADR 0003) ─────
// Nunca se recalcula LOS en el visor: todo lo que se muestra sale de los
// artefactos exportados por el pipeline.

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
      demands: demandPoints.features.map((feature) => ({ id: feature.properties.id, label: feature.properties.id, population: feature.properties.population, longitude: feature.geometry.coordinates[0], latitude: feature.geometry.coordinates[1] })),
      // Sólo candidatos vigentes: los excluidos por PRC/sensibles viven en
      // excluded_candidates.geojson y se dibujan como cruces de la carta.
      candidates: candidates.features.filter((feature) => feature.properties.constraint_status !== "excluded").map((feature) => ({ id: feature.properties.id, label: feature.properties.id, longitude: feature.geometry.coordinates[0], latitude: feature.geometry.coordinates[1], radiusM: feature.properties.radius_m ?? null, constraintStatus: feature.properties.constraint_status })),
      coverage: graph.coverage,
      connectivity: Object.fromEntries(candidates.features.map((feature) => [feature.properties.id, connectivity?.[feature.properties.id] || []])),
      connectedSolution: (connectedResult || metrics.results[0]).selected,
      hasConnectivity: Boolean(connectivity && connectedResult),
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

async function loadTerrain(directory) {
  try {
    const response = await fetch(`../outputs/${directory}/terrain.json`, { cache: "no-cache" });
    if (!response.ok) throw new Error("terrain.json");
    return response.json();
  } catch (_) {
    return null;
  }
}

// Carga (con caché) y muestra la simulación de una zona del mapa.
async function showZone(zone) {
  stop();
  state.activeZone = zone;
  // La carta de restricciones es por escenario: al cambiar de simulación se
  // limpia cualquier iluminación fijada (los filtros aplicados cambian).
  state.highlightPinned = null;
  state.hoverHighlight = null;
  state.highlight = null;
  if (!state.scenarios.has(zone.id)) state.scenarios.set(zone.id, await loadOutput(zone.directory, zone.name));
  const scenario = state.scenarios.get(zone.id);
  sceneStatus.textContent = scenario ? scenario.name : `${zone.name} no disponible`;
  if (!scenario) {
    simName.textContent = zone.name;
    playButton.disabled = true;
    return false;
  }
  if (!state.terrains.has(zone.id)) state.terrains.set(zone.id, await loadTerrain(zone.directory));
  const terrain = state.terrains.get(zone.id);
  state.scenario = scenario;
  state.terrain = terrain;
  state.step = 0;
  playButton.disabled = false;
  simName.textContent = zone.name;
  // La carta de restricciones (ADR 0015) se reconstruye por escenario: sus
  // filas y capas son de la corrida cargada.
  renderConstraintDrawer();
  if (terrain) {
    state.view = "terrain";
    sceneStatus.textContent = `${zone.subtitle} · arrastra para rotar`;
  } else {
    state.view = "terrain";
    sceneStatus.textContent = "Sin terrain.json: regenera el piloto con el pipeline actual";
  }
  renderAlgorithmSection();
  if (terrain) terrainView.render(state);
  updateTerrainLegend();
  update();
  return true;
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
  const kmSpan = (value) => new Intl.NumberFormat("es-CL", { maximumFractionDigits: 1 }).format(value / 1000);
  const notes = [`Este: 0-${kmSpan(right - left)} km · Norte: 0-${kmSpan(top - bottom)} km · Relieve ×2,5 (misma exageración del hillshade) · Torre 30 m a escala`];
  if (state.scenario.roads?.length) notes.push("© OpenStreetMap contributors");
  const exclusions = prcExclusions();
  if (exclusions.length) notes.push(`PRC: ${exclusions.length} exclusiones (screening, no permiso)`);
  terrainNote.textContent = notes.join(" · ");
}

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
// ── Navegación entre vistas: inicio → mapa → simulación ──────────────────

function showView(view) {
  [viewInicio, viewMapa, viewSim].forEach((section) => {
    section.hidden = section !== view;
  });
  window.scrollTo(0, 0);
}

async function openSimulation(zone) {
  // Transición: fade, cambio de vista, fade-out; la zona ya quedó cargando.
  viewFade.hidden = false;
  viewFade.classList.add("on");
  const loaded = await showZone(zone);
  showView(viewSim);
  await new Promise((resolve) => setTimeout(resolve, 380));
  viewFade.classList.remove("on");
  setTimeout(() => { viewFade.hidden = true; }, 420);
  if (loaded) setDrawer(false);
  return loaded;
}

// ── Mapa de Chile + carta de impacto social ──────────────────────────────

const map = createChileMap(document.querySelector("#chile-map"), document.querySelector("#zone-markers"), {
  onZoneClick(zone) {
    fillZoneCard(zone);
    map.preloadZone?.(zone);
    zoneCard.classList.add("open");
    zoneCard.setAttribute("aria-hidden", "false");
    document.querySelector("#chile-map").classList.add("card-open");
  },
});

function fillZoneCard(zone) {
  state.activeZone = zone;
  document.querySelector("#zone-coords").textContent = formatCoord(zone.center);
  document.querySelector("#zone-kicker").textContent = zone.kicker;
  document.querySelector("#zone-title").textContent = zone.name;
  document.querySelector("#zone-subtitle").textContent = zone.subtitle;
  document.querySelector("#zone-lead").textContent = zone.lead;
  const sections = document.querySelector("#zone-sections");
  sections.replaceChildren(
    ...zone.sections.map((section, index) => {
      const article = document.createElement("article");
      article.className = "zone-section";
      const label = document.createElement("p");
      label.className = "zone-section-label";
      const num = document.createElement("span");
      num.className = "zone-section-num";
      num.textContent = String(index + 1).padStart(2, "0");
      const title = document.createElement("span");
      title.className = "zone-section-title";
      title.textContent = section.title;
      label.append(num, title);
      article.append(label, ...section.paragraphs.map((text) => {
        const p = document.createElement("p");
        p.textContent = text;
        return p;
      }));
      return article;
    }),
  );
  // Ficha técnica con los números reales de la corrida versionada
  // (metrics.json): la carta nunca inventa cifras de la simulación.
  const chips = document.querySelector("#zone-chips");
  const chipsLabel = document.querySelector("#zone-chips-label");
  chips.hidden = true;
  chipsLabel.hidden = true;
  chips.replaceChildren();
  fetch(`../outputs/${zone.directory}/metrics.json`, { cache: "no-cache" })
    .then((response) => (response.ok ? response.json() : null))
    .then((metrics) => {
      if (!metrics) return;
      const exact = metrics.results.find((result) => result.algorithm === "exact_connected") || metrics.results[0];
      const percent = new Intl.NumberFormat("es-CL", { style: "percent", maximumFractionDigits: 1 });
      const share = exact.population_total ? percent.format(exact.population_covered / exact.population_total) : "—";
      const entries = [
        ["Cobertura exacta", `${number(exact.population_covered)} de ${number(exact.population_total)} hab (${share})`],
        ["Localidades", number(exact.num_demand_nodes ?? metrics.results[0].num_demand_nodes)],
        ["Antenas", `${exact.k} conectadas`],
        ["Evaluaciones", number(exact.evaluations)],
      ];
      chips.replaceChildren(...entries.map(([term, value]) => {
        const cell = document.createElement("div");
        cell.className = "zone-chip";
        const dt = document.createElement("dt");
        dt.textContent = term;
        const dd = document.createElement("dd");
        dd.textContent = value;
        cell.append(dt, dd);
        return cell;
      }));
      chips.hidden = false;
      chipsLabel.hidden = false;
    })
    .catch(() => { /* Sin métricas la carta queda sin ficha. */ });
  const sources = document.querySelector("#zone-sources");
  sources.innerHTML = `<p class="zone-sources-title">Fuentes</p>` + zone.sources
    .map((source) => `<a href="${source.url}" target="_blank" rel="noopener">${source.text}</a>`)
    .map((link) => `<span class="zone-source">${link}</span>`)
    .join("");
}

function closeZoneCard() {
  zoneCard.classList.remove("open");
  zoneCard.setAttribute("aria-hidden", "true");
  document.querySelector("#chile-map").classList.remove("card-open");
}

zoneCard.querySelector(".zone-card-close").addEventListener("click", closeZoneCard);

zoneCta.addEventListener("click", async () => {
  const zone = state.activeZone;
  if (!zone) return;
  closeZoneCard();
  // Zoom animado al territorio: la carta se va, el mapa vuela a la zona y
  // la transición entrega la simulación 3D.
  await map.focusZone(zone, 1500);
  await openSimulation(zone);
  map.resetView(0);
});

async function backToMap() {
  stop();
  setDrawer(false);
  showView(viewMapa);
  map.refresh();
  await map.resetView(1100);
}

document.querySelector("#btn-entrar").addEventListener("click", () => {
  showView(viewMapa);
  map.refresh();
});
for (const id of ["btn-entrar-hero", "btn-entrar-2", "btn-entrar-3"]) {
  document.querySelector(`#${id}`).addEventListener("click", () => {
    showView(viewMapa);
    map.refresh();
  });
}
document.querySelector("#btn-volver-inicio").addEventListener("click", () => showView(viewInicio));
document.querySelector("#btn-volver-mapa").addEventListener("click", backToMap);

// ── Controles de la simulación (cluster superior izquierdo) ──────────────

previousButton.addEventListener("click", () => { stop(); setStep(state.step - 1); });
nextButton.addEventListener("click", () => { stop(); setStep(state.step + 1); });
playButton.addEventListener("click", play);
resetButton.addEventListener("click", resetSimulation);
zoomInButton.addEventListener("click", () => terrainView.zoomIn());
zoomOutButton.addEventListener("click", () => terrainView.zoomOut());

// Lectura «×n.n» del zoom: 1 es el encuadre original. Refleja botones,
// rueda y reinicio; sólo escribe cuando el valor cambia.
const zoomReadout = document.querySelector("#zoom-readout");
(function watchZoom() {
  let last = "";
  const tick = () => {
    const text = `ZOOM ×${terrainView.zoomLevel().toFixed(1)}`;
    if (text !== last) {
      zoomReadout.textContent = text;
      last = text;
    }
    window.requestAnimationFrame(tick);
  };
  window.requestAnimationFrame(tick);
})();
constraintToggle.addEventListener("click", () => {
  setDrawer(!state.drawerOpen);
});
constraintClose.addEventListener("click", () => setDrawer(false));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (state.drawerOpen) setDrawer(false);
    else if (zoneCard.classList.contains("open")) closeZoneCard();
  }
});

function setDrawer(open) {
  state.drawerOpen = open;
  constraintDrawer.classList.toggle("open", open);
  constraintToggle.setAttribute("aria-expanded", String(open));
}

// ── Landing: cifras nacionales verificadas + resultados vivos ────────────

function fillLanding() {
  const factGrid = document.querySelector("#fact-grid");
  factGrid.replaceChildren(
    ...[
      { value: "196.156", label: "hogares chilenos siguen sin acceso propio a internet (3,4 % del país)" },
      { value: "95,1 % vs 96,8 %", label: "acceso pagado rural vs urbano en 2025; la brecha era de ~30 puntos en 2008" },
      { value: "4,9 %", label: "de las conexiones fijas de internet está en zonas rurales — el resto del acceso rural depende del celular" },
      { value: "> 12 m", label: "toda torre sobre esa altura exige recepción municipal (LGUC 116 bis F): dónde colocarla es una decisión de un solo intento" },
    ].map((fact) => {
      const div = document.createElement("div");
      div.className = "fact";
      div.innerHTML = `<strong>${fact.value}</strong><span>${fact.label}</span>`;
      return div;
    }),
  );
  const sources = document.querySelector("#nacional-sources");
  sources.innerHTML = NACIONAL.fuentes
    .map((source) => `<li><a href="${source.url}" target="_blank" rel="noopener">${source.text}</a></li>`)
    .join("");

  // Números vivos de las corridas versionadas: 827 localidades y la
  // cobertura exacta de cada piloto, tal como los muestra el visor.
  const heroStats = document.querySelector("#hero-stats");
  Promise.all(
    ZONES.map((zone) =>
      fetch(`../outputs/${zone.directory}/metrics.json`, { cache: "no-cache" })
        .then((response) => (response.ok ? response.json() : null))
        .catch(() => null),
    ),
  ).then((metricsList) => {
    const results = metricsList.filter(Boolean).map((metrics, index) => {
      const exact = metrics.results.find((result) => result.algorithm === "exact_connected") || metrics.results[0];
      return { zone: ZONES[index], exact };
    });
    if (!results.length) return;
    const percent = new Intl.NumberFormat("es-CL", { style: "percent", maximumFractionDigits: 1 });
    const localities = results.reduce((sum, r) => sum + (r.exact.num_demand_nodes ?? 0), 0);
    const hab = results.reduce((sum, r) => sum + (r.exact.population_total ?? 0), 0);
    const covered = results.reduce((sum, r) => sum + (r.exact.population_covered ?? 0), 0);
    heroStats.innerHTML = [
      `<div class="hero-stat"><b>${number(localities)}</b><span>localidades simuladas</span></div>`,
      `<div class="hero-stat"><b>${number(hab)}</b><span>habitantes analizados</span></div>`,
      `<div class="hero-stat"><b>${number(covered)}</b><span>habitantes cubiertos con k = 5 antenas conectadas</span></div>`,
    ].join("") + results
      .map((r) => `<div class="hero-stat zone"><b>${percent.format(r.exact.population_covered / r.exact.population_total)}</b><span>${r.zone.name.split("·")[0].trim()}</span></div>`)
      .join("");
    heroStats.hidden = false;
  });
}

// ── Arranque ──────────────────────────────────────────────────────────────

mountRayBursts();
fillLanding();
document.querySelector("#map-attribution").textContent = "© OpenStreetMap · SRTM · OpenTopoMap";
map.load().then(() => {
  // Precarga silenciosa de los tres pilotos: al elegir una zona la
  // simulación ya está lista.
  ZONES.forEach(async (zone) => {
    if (!state.scenarios.has(zone.id)) state.scenarios.set(zone.id, await loadOutput(zone.directory, zone.name));
    if (!state.terrains.has(zone.id)) state.terrains.set(zone.id, await loadTerrain(zone.directory));
  });
});

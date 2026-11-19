/**
 * Laboratorio didáctico del motor exacto conectado.
 *
 * Espejo en TypeScript de `simulacion/src/algorithms/connected.py` del repo
 * proyecto-grafos (ESU de Wernicke 2006 + objetivo unión incremental + cota
 * de prefijos + desempate lexicográfico), instrumentado para registrar cada
 * paso de la búsqueda como un evento narrable. Sobre una instancia sintética
 * pequeña ("Valle Escondido") un usuario puede recorrer la enumeración paso a
 * paso y ver por qué el objetivo es la unión, por qué la conectividad obliga,
 * y cuándo y por qué la cota poda.
 *
 * La instancia es sintética y declarada como tal: los pilotos reales están
 * en /data/pilots/*.json y nunca se inventan resultados para ellos.
 */

export interface LabLocality {
  id: string;
  name: string;
  x: number;
  y: number;
  pop: number;
}

export interface LabCandidate {
  id: string;
  name: string;
  x: number;
  y: number;
  covers: string[];
  neighbors: string[];
}

export const LAB_INSTANCE = {
  name: "Valle Escondido",
  localities: [
    { id: "L1", name: "Caserío Arenal", x: 44, y: 142, pop: 68 },
    { id: "L2", name: "Secano Norte", x: 122, y: 58, pop: 45 },
    { id: "L3", name: "Villa Cedro", x: 168, y: 104, pop: 120 },
    { id: "L4", name: "Puerta Alta", x: 256, y: 88, pop: 54 },
    { id: "L5", name: "Posta El Rocío", x: 372, y: 72, pop: 31 },
    { id: "L6", name: "La Ribera", x: 232, y: 192, pop: 97 },
    { id: "L7", name: "Alto Molino", x: 358, y: 214, pop: 76 },
    { id: "L8", name: "Fundo Los Tres", x: 500, y: 292, pop: 24 },
    { id: "L9", name: "Paso Hondo", x: 392, y: 268, pop: 58 },
    { id: "L10", name: "Bajo Luma", x: 462, y: 372, pop: 40 },
  ] satisfies LabLocality[],
  candidates: [
    { id: "A", name: "Cerro Trono", x: 76, y: 88, covers: ["L1", "L2", "L3"], neighbors: [] },
    { id: "B", name: "Loma Redonda", x: 210, y: 150, covers: ["L3", "L4", "L6"], neighbors: ["C", "D"] },
    { id: "C", name: "Alto Cedro", x: 322, y: 108, covers: ["L4", "L5", "L9"], neighbors: ["B", "D"] },
    { id: "D", name: "Piedra Blanca", x: 298, y: 226, covers: ["L6", "L7"], neighbors: ["B", "C", "E"] },
    { id: "E", name: "Morro Luma", x: 408, y: 296, covers: ["L7", "L9", "L10"], neighbors: ["D", "F"] },
    { id: "F", name: "Puesto Bajo Luma", x: 478, y: 344, covers: ["L8", "L10"], neighbors: ["E"] },
  ] satisfies LabCandidate[],
} as const;

export const LAB_TOTAL_POP = LAB_INSTANCE.localities.reduce((s, l) => s + l.pop, 0);

export const LAB_K_OPTIONS = [2, 3] as const;
export type LabK = (typeof LAB_K_OPTIONS)[number];

export type LabStepKind =
  | "intro" // presenta el problema o una pieza del modelo
  | "root" // nueva raíz ESU
  | "enter" // una antena entra a S
  | "evaluate" // se evalúa S (posible nuevo mejor)
  | "prune" // la cota poda la rama
  | "exit" // retroceso (la antena sale de S)
  | "solution" // el óptimo encontrado
  | "greedy" // baseline goloso
  | "outro"; // contraste y cierre

export interface LabStep {
  kind: LabStepKind;
  title: string;
  note: string;
  /** estado del mapa en este paso */
  S: string[];
  ext: string[]; // candidatos en la lista de extensión
  nexcl: string[]; // vecinos que entraron por la regla Nexcl
  covered: string[]; // localidades cubiertas por S (unión)
  f: number;
  bestS: string[];
  bestF: number;
  evals: number;
  bound: number | null; // cota de prefijos aplicable en este nodo (null = n/a)
  improved?: boolean;
  added?: string;
  removed?: string;
}

export interface LabStats {
  k: LabK;
  totalPop: number;
  combos: number; // combinaciones de hasta k candidatos (fuerza bruta)
  connectedCount: number; // subconjuntos conexos ≤ k que existen
  evals: number; // evaluaciones del motor = subconjuntos conexos visitados
  prunes: number;
  bestS: string[];
  bestF: number;
  greedyS: string[];
  greedyF: number;
  greedyEvals: number;
}

const fmt = new Intl.NumberFormat("es-CL");
export const labNumber = (n: number) => fmt.format(n);
export const labPct = (n: number) =>
  `${new Intl.NumberFormat("es-CL", { maximumFractionDigits: 1 }).format((100 * n) / LAB_TOTAL_POP)} %`;

const ID = (c: LabCandidate) => c.id;
const ANTENNAS = LAB_INSTANCE.candidates.map(ID);
const IDX = new Map(ANTENNAS.map((id, i) => [id, i]));
const BY_ID = new Map(LAB_INSTANCE.candidates.map((c) => [c.id, c]));
const LOC_BY_ID = new Map(LAB_INSTANCE.localities.map((l) => [l.id, l]));
const NBR = new Map(
  LAB_INSTANCE.candidates.map((c) => [
    c.id,
    [...c.neighbors].sort((a, b) => (IDX.get(a) ?? 0) - (IDX.get(b) ?? 0)),
  ]),
);
const COV = new Map(LAB_INSTANCE.candidates.map((c) => [c.id, c.covers]));

/** unión de coberturas de S: el objetivo, nunca la suma por antena */
function unionCovers(S: string[]): string[] {
  const set = new Set<string>();
  for (const a of S) for (const d of COV.get(a) ?? []) set.add(d);
  return [...set].sort();
}

function fOf(S: string[]): number {
  return unionCovers(S).reduce((s, d) => s + (LOC_BY_ID.get(d)?.pop ?? 0), 0);
}

/** contadores cover con traza de deshacer, como _aplicar/_deshacer en connected.py */
const coverCounters = () => new Map<string, number>(LAB_INSTANCE.localities.map((l) => [l.id, 0]));

function aplicar(cover: Map<string, number>, a: string): number {
  let inc = 0;
  for (const d of COV.get(a) ?? []) {
    if ((cover.get(d) ?? 0) === 0) inc += LOC_BY_ID.get(d)?.pop ?? 0;
    cover.set(d, (cover.get(d) ?? 0) + 1);
  }
  return inc;
}

function deshacer(cover: Map<string, number>, a: string): number {
  let dec = 0;
  for (const d of COV.get(a) ?? []) {
    cover.set(d, (cover.get(d) ?? 0) - 1);
    if ((cover.get(d) ?? 0) === 0) dec += LOC_BY_ID.get(d)?.pop ?? 0;
  }
  return dec;
}

const setLabel = (S: string[]) => (S.length ? `{ ${[...S].sort().join(", ")} }` : "∅");

/**
 * Motor exacto instrumentado: mismo orden, misma regla ESU (Nexcl con id
 * > raíz, evaluada contra N(S) antes de absorber N(a)), misma cota de
 * prefijos con poda estricta (<, nunca ≤) y mismo desempate lexicográfico
 * que `resolver()` en connected.py.
 */
function exactWithEvents(k: LabK, push: (s: LabStep) => void): { stats: Omit<LabStats, "k" | "totalPop" | "combos" | "greedyS" | "greedyF" | "greedyEvals"> } {
  const cover = coverCounters();
  // cota estática I3: suma de los m mayores pesos totales por candidato
  const totales = ANTENNAS.map((a) => (COV.get(a) ?? []).reduce((s, d) => s + (LOC_BY_ID.get(d)?.pop ?? 0), 0)).sort(
    (a, b) => b - a,
  );
  const prefix = [0];
  for (const t of totales.slice(0, Math.min(k, ANTENNAS.length))) prefix.push(prefix[prefix.length - 1] + t);

  const estado = { f: 0, evals: 0, bestS: [] as string[], bestF: 0 };
  let prunes = 0;

  const boundAt = (size: number) => prefix[Math.min(k - size, prefix.length - 1)];

  const base = (over: Partial<LabStep>): LabStep => ({
    kind: "evaluate",
    title: "",
    note: "",
    S: [...S_state],
    ext: [],
    nexcl: [],
    covered: unionCovers(S_state),
    f: estado.f,
    bestS: [...estado.bestS],
    bestF: estado.bestF,
    evals: estado.evals,
    bound: boundAt(S_state.length),
    ...over,
  });

  let S_state: string[] = [];
  const alcanzados = new Set<string>();

  function evaluar(): boolean {
    estado.evals += 1;
    const S_tuple = [...S_state].sort();
    const prevS = [...estado.bestS];
    const prevF = estado.bestF;
    // desempate lexicográfico estricto (I4): nunca se poda por empate
    const improved =
      estado.bestF < estado.f ||
      (estado.bestF === estado.f &&
        (estado.bestS.length === 0 || S_tuple.join("|") < estado.bestS.join("|")));
    if (improved) {
      estado.bestS = S_tuple;
      estado.bestF = estado.f;
    }
    const bound = boundAt(S_state.length);
    push(
      base({
        kind: "evaluate",
        title: improved
          ? `Nuevo mejor: f(${setLabel(S_state)}) = ${labNumber(estado.f)} hab`
          : `Se evalúa S = ${setLabel(S_state)}: f = ${labNumber(estado.f)} hab`,
        note: improved
          ? `La población única cubierta por ${setLabel(S_state)} es ${labNumber(estado.f)} hab (unión de sus coberturas) y supera al mejor anterior: ${labNumber(prevF)} hab con ${setLabel(prevS)}. Si dos conjuntos empataran en valor, ganaría la tupla menor: el desempate es lexicográfico y la cota nunca poda por empate (invariante I4).`
          : `Población única cubierta (unión de coberturas): ${labNumber(estado.f)} hab. El mejor sigue siendo f* = ${labNumber(estado.bestF)} con ${setLabel(estado.bestS)}. Con la cota disponible (${labNumber(bound)} hab por incorporar) la rama continúa: ${labNumber(estado.f + bound)} ≥ f*.`,
        improved,
      }),
    );
    // cota estricta: ninguna expansión supera al mejor → la rama entera se descarta
    if (estado.f + bound < estado.bestF) {
      if (S_state.length < k) {
        prunes += 1;
        push(
          base({
            kind: "prune",
            title: `Poda en ${setLabel(S_state)}`,
            note: `f(S) = ${labNumber(estado.f)} + cota de prefijos ${labNumber(bound)} = ${labNumber(estado.f + bound)} < mejor f* = ${labNumber(estado.bestF)}. Ninguna expansión de esta rama puede superar al mejor: el motor la descarta completa sin entrar. Poda sólo con comparación estricta (<): un empate nunca se poda, para no perder soluciones óptimas.`,
          }),
        );
      }
      return false;
    }
    return true;
  }

  function expandir(v_raiz: string, ext: string[]): void {
    const alive = evaluar();
    if (!alive || S_state.length === k || ext.length === 0) return;
    for (let i = 0; i < ext.length; i++) {
      const a = ext[i];
      const resto = ext.slice(i + 1); // a y los anteriores quedan excluidos en esta rama
      // regla ESU (Wernicke 2006, E4): Nexcl(a, S) ∩ {id > raíz}, evaluada
      // contra N(S) ANTES de absorber N(a) — cada conexo se genera una vez
      const nuevos = (NBR.get(a) ?? []).filter(
        (u) => (IDX.get(u) ?? 0) > (IDX.get(v_raiz) ?? 0) && !alcanzados.has(u) && !S_state.includes(u),
      );
      const traza = (NBR.get(a) ?? []).filter((u) => !alcanzados.has(u));
      S_state = [...S_state, a];
      const estadoPrevio = estado.f;
      for (const u of traza) alcanzados.add(u);
      estado.f += aplicar(cover, a);
      push(
        base({
          kind: "enter",
          title: `Entra ${a} (${BY_ID.get(a)?.name}) a S`,
          note:
            `S = ${setLabel(S_state)}. Ganancia de f: +${labNumber(estado.f - estadoPrevio)} hab — sólo "estrenos": si una localidad ya la cubría otra antena de S, no se cuenta dos veces (el objetivo es la unión, no la suma por antena). ` +
            (nuevos.length
              ? `La regla Nexcl agrega a la lista de extensión [${nuevos.join(", ")}]: vecinos de ${a} con id mayor que la raíz ${v_raiz} que ningún vértice previo de S alcanzaba. Así cada subconjunto conexo se genera exactamente una vez (invariante I1).`
              : `${a} no aporta vecinos nuevos a la extensión; la rama sólo puede retroceder o evaluar.`),
          ext: [...resto, ...nuevos],
          nexcl: nuevos,
          added: a,
        }),
      );
      expandir(v_raiz, [...resto, ...nuevos]);
      for (const u of traza) alcanzados.delete(u);
      estado.f -= deshacer(cover, a);
      S_state = S_state.filter((x) => x !== a);
      push(
        base({
          kind: "exit",
          title: `Sale ${a}: retroceso`,
          note: `Los contadores de cobertura se deshacen con su traza (f vuelve a ${labNumber(estado.f)} hab) y S queda ${setLabel(S_state)}. El bucle continúa con los demás candidatos de la lista de extensión.`,
          ext: resto,
          removed: a,
        }),
      );
    }
  }

  for (const raiz of ANTENNAS) {
    // raíz = vértice mínimo del conjunto: cada conexo se genera una vez
    S_state = [raiz];
    alcanzados.clear();
    for (const u of NBR.get(raiz) ?? []) alcanzados.add(u);
    estado.f += aplicar(cover, raiz);
    push(
      base({
        kind: "root",
        title: `Raíz ${raiz} (${BY_ID.get(raiz)?.name})`,
        note: `Todo subconjunto conexo se enumera bajo su vértice mínimo, así nunca se repite (I1). ${raiz} entra a S: f = ${labNumber(estado.f)} hab. La lista de extensión parte con sus vecinos de id mayor: [${(NBR.get(raiz) ?? []).filter((u) => (IDX.get(u) ?? 0) > (IDX.get(raiz) ?? 0)).join(", ") || "—"}]` +
          ((NBR.get(raiz) ?? []).length === 0
            ? ` · ${raiz} no tiene enlaces en G_conn: ninguna otra antena puede unírsele, el subconjunto sólo puede ser {${raiz}}.`
            : ""),
        ext: (NBR.get(raiz) ?? []).filter((u) => (IDX.get(u) ?? 0) > (IDX.get(raiz) ?? 0)),
      }),
    );
    expandir(raiz, (NBR.get(raiz) ?? []).filter((u) => (IDX.get(u) ?? 0) > (IDX.get(raiz) ?? 0)));
    estado.f -= deshacer(cover, raiz);
    S_state = [];
  }

  return {
    stats: {
      connectedCount: estado.evals,
      evals: estado.evals,
      prunes,
      bestS: estado.bestS,
      bestF: estado.bestF,
    },
  };
}

/** baseline goloso (greedy_conectado): semillas por orden, mayor margen, empate → menor id */
function greedyConectado(k: LabK, push: (s: LabStep) => void): { S: string[]; f: number; evals: number } {
  let bestS: string[] = [];
  let bestF = 0;
  let evals = 0;
  for (const semilla of ANTENNAS) {
    const S: string[] = [semilla];
    const cover = coverCounters();
    let f = aplicar(cover, semilla);
    while (S.length < k) {
      const frontera = [...new Set(S.flatMap((x) => NBR.get(x) ?? []))].filter((u) => !S.includes(u)).sort((a, b) => (IDX.get(a) ?? 0) - (IDX.get(b) ?? 0));
      let mejorA: string | null = null;
      let mejorGanancia = 0;
      for (const a of frontera) {
        evals += 1;
        // margen: peso no cubierto todavía por S (como greedy_conectado)
        const ganancia = (COV.get(a) ?? []).reduce(
          (s, d) => s + ((cover.get(d) ?? 0) === 0 ? (LOC_BY_ID.get(d)?.pop ?? 0) : 0),
          0,
        );
        if (ganancia > mejorGanancia) {
          mejorA = a;
          mejorGanancia = ganancia;
        }
      }
      if (mejorA === null) break;
      S.push(mejorA);
      f += aplicar(cover, mejorA);
    }
    if (f > bestF) {
      bestF = f;
      bestS = [...S].sort();
    }
  }
  push({
    kind: "greedy",
    title: `Baseline goloso: f = ${labNumber(bestF)} hab con ${setLabel(bestS)}`,
    note: `El goloso parte de cada semilla y agrega siempre el vecino de S con mayor margen (peso no cubierto). Es rápido, pero sólo garantiza calidad ≤ óptimo: aquí alcanza ${labNumber(bestF)} hab con ${evals} evaluaciones — puede coincidir con el óptimo, pero no puede probar que no existe nada mejor. En los pilotos reales sirve de contraste rápido-vs-exacto.`,
    S: [],
    ext: [],
    nexcl: [],
    covered: unionCovers(bestS),
    f: 0,
    bestS,
    bestF,
    evals,
    bound: null,
  });
  return { S: bestS, f: bestF, evals };
}

export interface LabTimeline {
  steps: LabStep[];
  stats: LabStats;
}

export function buildLabTimeline(k: LabK): LabTimeline {
  const steps: LabStep[] = [];
  const push = (s: LabStep) => steps.push(s);

  // ── introducción: el problema y las piezas del modelo ──
  const intro = (
    title: string,
    note: string,
    S: string[] = [],
  ): LabStep => ({
    kind: "intro",
    title,
    note,
    S,
    ext: [],
    nexcl: [],
    covered: unionCovers(S),
    f: fOf(S),
    bestS: [],
    bestF: 0,
    evals: 0,
    bound: null,
  });

  steps.push(
    intro(
      "Una instancia para aprender: Valle Escondido",
      `10 localidades rurales (${labNumber(LAB_TOTAL_POP)} hab) y 6 sitios candidatos a antena. Hay que elegir hasta k antenas para maximizar la población única cubierta, con la red en un solo componente. Esta instancia es sintética y pequeña a propósito: en los pilotos reales hay 25–121 candidatos y cientos de localidades (sus números están en el atlas).`,
    ),
  );
  steps.push(
    intro(
      "El objetivo es una unión, no una suma",
      `f(S) = población de la unión de las coberturas de las antenas elegidas. Loma Redonda (B) cubre 271 hab y Piedra Blanca (D) cubre 173 hab, pero juntas no suman 444: La Ribera (97 hab) queda en la zona de ambas y se cuenta una sola vez → f({B,D}) = 347. Ese es el obstáculo de aditividad del problema (y el comentario del profesor: "no sólo sumar cardinalidad").`,
      ["B", "D"],
    ),
  );
  steps.push(
    intro(
      "La red debe quedar conectada",
      `Dos antenas sólo pueden elegirse juntas si existe un enlace factible entre ellas (línea de vista sobre el relieve, radios compatibles). Cerro Trono (A) cubre 233 hab, pero no tiene ningún enlace en G_conn: jamás puede formar parte de una red de más de una antena. La conectividad no es un detalle estético: es requisito del problema.`,
      ["A"],
    ),
  );
  steps.push(
    intro(
      "Enumeración canónica: ESU (Wernicke 2006)",
      `En vez de revisar todas las combinaciones de hasta k candidatos (${labNumber(sumComb(ANTENNAS.length, k))} aquí, muchas desconectadas e inviables), el motor recorre sólo subconjuntos conexos con la regla de extensión Nexcl: cada conexo se genera exactamente una vez, bajo su vértice mínimo (invariante I1). A la derecha se dibuja G_conn: los enlaces factibles entre candidatos.`,
    ),
  );
  steps.push(
    intro(
      "La cota de prefijos permite podar",
      `Con m incorporaciones restantes, f puede crecer a lo sumo la suma de los m mayores pesos totales por candidato. Si f(S) + cota < mejor f*, ninguna expansión de la rama supera al mejor: se descarta completa. La comparación es estricta (<): un empate nunca se poda, para no perder óptimos (invariante I4). Con k = 2 verás una poda real en {F}.`,
    ),
  );

  // ── búsqueda exacta instrumentada ──
  const { stats } = exactWithEvents(k, push);

  // ── cierre: solución, baseline goloso y contraste ──
  const combos = sumComb(ANTENNAS.length, k);
  steps.push({
    kind: "solution",
    title: `Óptimo exacto: ${setLabel(stats.bestS)} — ${labNumber(stats.bestF)} hab (${labPct(stats.bestF)})`,
    note: `El motor garantiza que nada mejor existe: revisó cada subconjunto conexo de hasta ${k} antenas (${stats.evals} evaluaciones, ${stats.prunes} podas) y la solución ${setLabel(stats.bestS)} forma un solo componente en G_conn. Población sin alcance: ${labNumber(LAB_TOTAL_POP - stats.bestF)} hab. En los pilotos reales el mismo motor, cota y desempate corren sobre 25–121 candidatos con presupuesto de evaluaciones.`,
    S: stats.bestS,
    ext: [],
    nexcl: [],
    covered: unionCovers(stats.bestS),
    f: stats.bestF,
    bestS: stats.bestS,
    bestF: stats.bestF,
    evals: stats.evals,
    bound: null,
  });
  const greedy = greedyConectado(k, push);
  steps.push({
    kind: "outro",
    title: `Lo que el motor evita: ${combos} combinaciones de fuerza bruta`,
    note:
      `Fuerza bruta probaría ${combos} subcombinaciones (incluidas las inválidas por desconectadas). ESU visitó sólo ${stats.connectedCount} subconjuntos — los conexos que existen` +
      (stats.prunes
        ? ` — y la cota descartó ${stats.prunes} ramas completas antes de entrar`
        : ` — y en este k la cota no llegó a descartar ninguna rama (el margen más estrecho, f({E,F}) + cota = 469, quedó sobre f* = 445; baja a k = 2 y verás podas reales)`) +
      `. Además el objetivo se mantuvo como unión incremental con contadores de cobertura y deshacer por traza: nunca se recalcula f desde cero (invariante I2), y el presupuesto max_evaluations sigue como protección de peor caso.`,
    S: stats.bestS,
    ext: [],
    nexcl: [],
    covered: unionCovers(stats.bestS),
    f: stats.bestF,
    bestS: stats.bestS,
    bestF: stats.bestF,
    evals: stats.evals,
    bound: null,
  });

  return {
    steps,
    stats: {
      k,
      totalPop: LAB_TOTAL_POP,
      combos,
      connectedCount: stats.connectedCount,
      evals: stats.evals,
      prunes: stats.prunes,
      bestS: stats.bestS,
      bestF: stats.bestF,
      greedyS: greedy.S,
      greedyF: greedy.f,
      greedyEvals: greedy.evals,
    },
  };
}

function comb(n: number, r: number): number {
  if (r < 0 || r > n) return 0;
  let out = 1;
  for (let i = 0; i < r; i++) out = (out * (n - i)) / (i + 1);
  return Math.round(out);
}

/** Σ C(n, r) para r = 1..maxR: lo que revisaría la fuerza bruta */
function sumComb(n: number, maxR: number): number {
  let out = 0;
  for (let r = 1; r <= Math.min(maxR, n); r++) out += comb(n, r);
  return out;
}

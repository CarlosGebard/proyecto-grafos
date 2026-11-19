/**
 * Red Austral — pilotos reales del proyecto de optimización de cobertura
 * territorial mediante grafos (repositorio proyecto-grafos, rama web-rework).
 *
 * El contenido de las cartas se investigó sobre fuentes públicas
 * verificables (noviembre de 2026): INE Censo 2017, BCN Reportes Comunales,
 * PLADECO/PMC municipales, Archivo Histórico de Concepción, Consejo de
 * Monumentos Nacionales, SUBTEL, Fundación País Digital (Hogares Conectados
 * 2026, con Casen 2024) y prensa regional citada en cada carta. Las cifras
 * de cobertura NO van fijas aquí: las entrega el paquete de simulación
 * (`public/data/pilots/<id>.json`), generado desde los artefactos
 * versionados de `simulacion/outputs/` (metrics.json exact_connected).
 */

export type PilotSection = {
  title: string;
  paragraphs: string[];
};

export type PilotSource = {
  text: string;
  url: string;
};

export type Pilot = {
  id: PilotId;
  name: string;
  subtitle: string;
  /** Centro de la ventana de estudio [lon, lat] (config del piloto). */
  center: [number, number];
  /** Zoom Leaflet al volar a la zona. */
  focusZoom: number;
  /** Etiqueta del marcador: "arriba" | "abajo" (Yumbel y Biobío son vecinos). */
  labelSide: "arriba" | "abajo";
  kicker: string;
  lead: string;
  sections: PilotSection[];
  sources: PilotSource[];
};

export type PilotId = "yumbel" | "biobio" | "metropolitana";

export const PILOTS: Pilot[] = [
  {
    id: "yumbel",
    name: "Yumbel",
    subtitle: "Región del Biobío · ventana de 50 × 50 km",
    center: [-72.556, -37.128],
    focusZoom: 10.5,
    labelSide: "arriba",
    kicker: "Comuna histórica de la frontera del Biobío",
    lead: "435 localidades rurales con 30.923 habitantes en una ventana de 50 km. Capital provincial del peregrinaje: cada 20 de enero y 20 de marzo el santuario de San Sebastián concentra cerca de un millón de visitas en dos días.",
    sections: [
      {
        title: "Historia y acceso a la conectividad",
        paragraphs: [
          "Yumbel nació como fuerte fronterizo en 1585 (San Felipe de Segundo de Austria, renombrado Santa Lucía de Yumbel en 1603), en el borde del río Biobío durante la Guerra de Arauco. Fue siempre lugar de paso. La imagen de San Sebastián llegó enterrada en 1655 y desde 1663 estructura la vida religiosa de la zona: el santuario actual se levantó entre 1856 y 1859, y las peregrinaciones masivas despegaron en los años 1760 y sobre todo con el ferrocarril Chillán–Talcahuano de la década de 1870, que por primera vez acercó masivamente la zona al resto del país.",
          "El pueblo de Guayacán y su iglesia —estación clave de la peregrinación— están declarados Zona Típica y Monumento Histórico por el Consejo de Monumentos Nacionales. La modernización histórica de Yumbel llegó por rieles; la conectividad digital actual sigue siendo precaria en sus sectores rurales, como en casi todo el Biobío interior.",
        ],
      },
      {
        title: "Quién habita la zona",
        paragraphs: [
          "21.198 habitantes según el Censo 2017 (INE); por distritos censales, cerca de la mitad vive fuera de la ciudad, en localidades rurales dispersas de secano (Choihue, Rere, Lucay, Tomeco, San Cristóbal). Es una comuna de pequeña agricultura y comercio asociado al santuario, con envejecimiento pronunciado: el 22,8 % tenía 60 años o más en 2017.",
          "Ese perfil coincide con el retrato nacional del hogar aún desconectado que mide Fundación País Digital (Hogares Conectados 2026, con Casen 2024 y la encuesta de SUBTEL): segmento socioeconómico E, educación básica incompleta, jefes de hogar obreros no calificados — y 47,3 % de esos hogares es rural.",
        ],
      },
      {
        title: "Situación actual",
        paragraphs: [
          "Es el piloto más exigente de los tres: la simulación con umbral t = 5.000 habitantes por antena, clases de potencia y screening del PRC deja sin alcance a la mayor parte de la población de la ventana con k = 5 antenas. No es un defecto del algoritmo: es el reflejo de que 5 sitios no alcanzan para 435 localidades dispersas — la instancia muestra por qué este tipo de decisión importa.",
          "La red de salud referencia es el Hospital de Laja (inaugurado 2015), diseñado para ~30.000 usuarios de Laja, San Rosendo y Yumbel: telemedicina para las postas rurales depende críticamente de enlaces estables que hoy no llegan parejo.",
        ],
      },
      {
        title: "Impacto social si el proyecto se concretara",
        paragraphs: [
          "Coordinación de emergencia y turismo religioso: cerca de un millón de peregrinos en dos días saturan un territorio rural — comunicaciones disponibles cambian la gestión de salud, seguridad y tránsito de la fiesta más grande del sur de Chile.",
          "Para la población permanente: telesalud en postas de secano, continuidad educativa (clases y contenidos para escuelas rurales pequeñas) y canales de venta digital para la pequeña agricultura y el comercio local. La agenda nacional ya despliega antenas en localidades obligatorias (WOM autorizó 366 en 2026): este estudio muestra dónde conviene que esas torres se paren para cubrir más población con menos sitios.",
        ],
      },
    ],
    sources: [
      {
        text: "Archivo Histórico de Concepción — La fiesta de San Sebastián de Yumbel (2024)",
        url: "https://www.archivohistoricoconcepcion.cl/la-fiesta-de-san-sebastian-de-yumbel/",
      },
      {
        text: "Consejo de Monumentos Nacionales — Iglesia y Pueblo de Guayacán",
        url: "https://www.monumentos.gob.cl/monumentos/monumentos-historicos/iglesia-de-guayacan",
      },
      {
        text: "INE — Censo 2017, comuna de Yumbel (21.198 hab.)",
        url: "https://www.ine.gob.cl/estadisticas/sociales/demografia-y-vitales/censos-de-poblacion-y-vivienda",
      },
      {
        text: "Fundación País Digital — Hogares Conectados 2026 (Casen 2024 + Subtel)",
        url: "https://www.fundacionpaisdigital.cl/",
      },
    ],
  },
  {
    id: "biobio",
    name: "Piloto Biobío · Laja – Salto del Laja",
    subtitle: "Región del Biobío · ventana de 18 × 22 km",
    center: [-72.55, -37.2],
    focusZoom: 12,
    labelSide: "abajo",
    kicker: "Territorio entre ríos, industria y turismo de naturaleza",
    lead: "82 localidades con 5.234 habitantes junto a la confluencia de los ríos Biobío y Laja. Territorio pequeño y denso en historia: ferrocarril en 1871, celulosa en 1954 y los Saltos del Laja como destino turístico regional.",
    sections: [
      {
        title: "Historia y acceso a la conectividad",
        paragraphs: [
          "Laja —la «Isla de la Laxa» rodeada por los ríos Biobío, Laja y Huaqui— se pobló de verdad desde 1871 con las faenas del ferrocarril San Rosendo–Angol. Hasta 1954 fue una comunidad agrícola: ese año la planta de pulpa de CMPC transformó su economía y disparó la población. Cada modernización (riel, industria) reordenó la vida del territorio; la conectividad digital sigue pendiente en sus sectores rurales.",
          "El dato más elocuente del perfil local: en todo el registro tributario de la comuna hay 3 trabajadores formales en información y comunicaciones (SII, 2018). El acceso a la conectividad no fue parte del desarrollo económico del territorio.",
        ],
      },
      {
        title: "Quién habita la zona",
        paragraphs: [
          "22.389 habitantes (Censo 2017), con un 27,5 % rural. El empleo se reparte en servicios (75 %), industria (16 %) y sector primario (9 %): forestal, hortalizas, frutos silvestres, leche y ganadería. El Hospital de Laja (2015) referencia a Laja, San Rosendo y Yumbel — ~30.000 usuarios para una sola red de salud rural.",
          "Es el segmento exacto donde el país todavía tiene brecha: hogares de segmento E con educación básica incompleta concentran la desconexión nacional (Hogares Conectados 2026).",
        ],
      },
      {
        title: "Situación actual",
        paragraphs: [
          "Los Saltos del Laja son Zona de Interés Turístico (ZOIT) desde 2012, pero la temporada 2026 golpeó duro: los incendios forestales de febrero dejaron la ocupación de cabañas y restaurantes un 55 % abajo, y el sistema frontal de julio redujo las visitas hasta un 90 %. Un destino que vive del flujo de visitantes necesita comunicaciones para promocionarse, recibir reservas y coordinar emergencias.",
          "La simulación en esta ventana (82 localidades, 40 sitios candidatos del criterio territorial) selecciona k = 5 antenas y logra la cobertura conectada de la mayoría de la población de la ventana con la red en un solo componente.",
        ],
      },
      {
        title: "Impacto social si el proyecto se concretara",
        paragraphs: [
          "Reactivación turística con herramientas digitales (visibilidad, reservas, contenidos) para un destino golpeado por incendios y clima; y gestión de emergencia permanente: la misma señal que promueve el destino coordina la respuesta ante el próximo incendio forestal.",
          "Telesalud para postas rurales alrededor de un hospital que ya atiende tres comunas, continuidad escolar en escuelas pequeñas, y teletrabajo viable para familias que hoy viajan a Los Ángeles por trabajo o trámites.",
        ],
      },
    ],
    sources: [
      {
        text: "Municipalidad de Laja — Plan Municipal de Cultura 2022-2026 (demografía, economía, historia)",
        url: "https://www.cultura.gob.cl/redcultura/wp-content/uploads/sites/69/2023/06/pmc-laja-2022-2026.pdf",
      },
      {
        text: "Subsecretaría de Turismo — Ficha ZOIT Saltos del Laja",
        url: "https://www.subturismo.gob.cl/wp-content/uploads/2021/06/5-ficha-actualizacion-plan-de-accion-prorroga-zoit-saltosdellaja2025-2.pdf",
      },
      {
        text: "TVU (feb 2026) — Ocupación en cabañas de Salto del Laja cayó 55 % por incendios",
        url: "https://www.tvu.cl/prensa/2026/02/28/ocupacion-en-cabanas-y-restaurantes-en-salto-del-laja-bajo-55-como-efecto-de-incendios-forestales.html",
      },
      {
        text: "INE — Censo 2017, comuna de Laja (22.389 hab.)",
        url: "https://www.ine.gob.cl/estadisticas/sociales/demografia-y-vitales/censos-de-poblacion-y-vivienda",
      },
    ],
  },
  {
    id: "metropolitana",
    name: "Piloto Metropolitana · Buin – Paine",
    subtitle: "Región Metropolitana · ventana rural de 20 × 20 km",
    center: [-70.85, -33.75],
    focusZoom: 12,
    labelSide: "arriba",
    kicker: "Cuenca de Angostura: periurbanización sobre suelo agrícola",
    lead: "310 localidades rurales con 28.337 habitantes a menos de 45 km de Santiago. La región más conectada del país tiene igual comunidades rurales dispersas que dependen del celular: aquí viven 26 de cada 28 mil habitantes cubiertos por la mejor corrida de los pilotos.",
    sections: [
      {
        title: "Historia y acceso a la conectividad",
        paragraphs: [
          "Buin se fundó como villa en 1884 (Decreto Supremo del 14 de febrero, firmado por Manuel Bulnes) sobre un territorio de haciendas y viñedos coloniales. La cuenca de Angostura fue siempre el paso obligado entre Santiago y el sur; hoy la ruta 5 y la Autopista del Maipo cruzan la comuna, que PLADECO describe como conectada por carreteras pero fragmentada por ellas para quien vive al lado.",
          "La modernización de esta zona fue vial e industrial, no digital: los sectores rurales de Buin y Paine norte (Alto Jahuel, Angostura, precordillera) quedaron cubiertos por señal celular básica pero lejos de la fibra que domina el acceso fijo nacional.",
        ],
      },
      {
        title: "Quién habita la zona",
        paragraphs: [
          "Buin creció de 96.614 (Censo 2017) a 116.969 habitantes (Censo 2024): +21,1 % en siete años — periurbanización acelerada de Santiago sobre suelo agrícola. En 2023 la comuna tenía 8.042 empresas, 62 % microempresas; el empleo se concentra en comercio (23 %), manufactura (21 %) y agricultura (20 %): frutales del valle del Maipo y proveedores de la capital.",
          "CASEN 2022: pobreza por ingresos 4,4 %, pero pobreza multidimensional 19,1 % — hogares con ingresos que igual carecen en educación, salud o entorno. Cuatro postas de salud rural atienden los sectores alejados de la ciudad.",
        ],
      },
      {
        title: "Situación actual",
        paragraphs: [
          "Es el mejor escenario de los tres pilotos: valle abierto con buena inter-visibilidad y localidades rurales relativamente cercanas entre sí. La simulación cubre 26.136 de 28.337 habitantes (92,2 %) con k = 5 antenas conectadas — la corrida muestra que con criterio territorial (y sin antenas sobre agua: la Laguna de Aculeo queda fuera del criterio), cinco sitios bien puestos alcanzan a casi toda la población rural de la ventana.",
          "El contraste regional importa: en la RM las conexiones fijas de internet son abrumadoramente urbanas — a nivel nacional, el 95,1 % de las conexiones fijas está en zonas urbanas y sólo el 4,9 % en rurales (SUBTEL, junio 2026).",
        ],
      },
      {
        title: "Impacto social si el proyecto se concretara",
        paragraphs: [
          "Ventas digitales para la microempresa agroalimentaria (cereza, uva de mesa, hortalizas) y teletrabajo viable para las familias periurbanas que hoy viajan diariamente a Santiago: conectar el radio rural es conectar la cadena de abasto de la capital.",
          "Telesalud efectiva en las postas rurales y continuidad educativa en escuelas de sectores como Angostura o Alto Jahuel. Y para los hogares del perfil E del territorio — el grupo que aún se desconecta — la antena bien ubicada es la diferencia entre tener señal disponible y poder usarla de verdad.",
        ],
      },
    ],
    sources: [
      {
        text: "BCN / INE — Buin: Censos 2017-2024, empresas, CASEN (síntesis Sitrural, ago 2025)",
        url: "https://www.sitrural.cl/wp-content/uploads/2025/08/Buin_demografica-1.pdf",
      },
      {
        text: "Municipalidad de Buin — PLADECO 2021-2028 (conectividad vial y territorio)",
        url: "https://www.buin.cl/wp-content/uploads/2021/09/PLADECO-Buin-2021-2028-portada-final-30.08.2021-1.pdf",
      },
      {
        text: "SUBTEL — Informe del Sector, junio 2026 (internet fijo: 95,1 % urbano / 4,9 % rural)",
        url: "https://www.subtel.gob.cl/wp-content/uploads/2026/08/Informe-del-Sector-Telecomunicaciones-Jun26-VF.pdf",
      },
      {
        text: "Fundación País Digital — Hogares Conectados 2026 (Casen 2024 + Subtel)",
        url: "https://www.fundacionpaisdigital.cl/",
      },
    ],
  },
];

export function getPilot(id: string): Pilot | undefined {
  return PILOTS.find((p) => p.id === id);
}

/* ─── paquete de simulación (public/data/pilots/<id>.json) ─────────── */

export type SimulationBundle = {
  id: string;
  bounds: [number, number, number, number]; // [oeste, sur, este, norte]
  metrics: {
    k: number;
    numCandidates: number;
    numDemandNodes: number;
    populationTotal: number;
    populationCovered: number;
    coveragePct: number;
    populationReachable: number;
    populationUnreachable: number;
    runtimeSeconds: number | null;
    evaluations: number | null;
    byStatus: { covered: number; reachable: number; unreachable: number };
    minPopulation: number | null;
    maxSlopeDeg: number | null;
    candidateSeparationM: number | null;
    losPairs: number | null;
    coverageEdgesCount: number | null;
    rejections: number | null;
    prcMode: string | null;
  };
  /** [lon, lat, población, estado] — estado: 0 sin alcance · 1 alcanzable · 2 cubierta */
  localities: [number, number, number, number][];
  /** [lon, lat, radio_m, seleccionada] */
  candidates: [number, number, number, number][];
  /** adyacencia entre candidatos (índices, i<j) */
  connEdges: [number, number][];
  /** aristas de cobertura: [índice candidato, índice localidad] */
  coverageEdges: [number, number][];
  restrictions: {
    title: string;
    value: string;
    body: string;
    count: string;
  }[];
};

export function formatCoord(lat: number, lon: number): string {
  const ns = lat < 0 ? "S" : "N";
  const ew = lon < 0 ? "W" : "E";
  const fmt = (v: number) => {
    const a = Math.abs(v);
    const d = Math.floor(a);
    const m = Math.round((a - d) * 60);
    return m === 60 ? `${d + 1}° 0′` : `${d}° ${String(m).padStart(2, "0")}′`;
  };
  return `${fmt(lat)} ${ns} / ${fmt(lon)} ${ew}`;
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 }).format(n);
}

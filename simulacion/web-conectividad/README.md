# Visor web de conectividad rural

Presentación estática en tres vistas — **inicio**, **mapa de Chile** con las
localidades de los tres pilotos como puntos brillantes y cartas de impacto
social por zona, y **simulación 3D** del relieve con los controles del
estudio — con el sistema visual «Red Austral» (rediseño implementado en
noviembre de 2026): portada editorial en papel hueso/cobalto con tipografía
propia, atlas y simulación en «noche blueprint» con puntos de señal. Sin
paso de build: three.js, el contorno de Chile, las localidades y las fuentes
tipográficas (Oswald, Archivo, IBM Plex Mono; OFL en `assets/fonts/`) están
vendidos en `vendor/` y `assets/`. La **capa base son tiles de
OpenStreetMap** (`osm-tiles.js`, ADR 0017, revisa ADR 0008): se descargan en
runtime con atribución visible y, sin red, ambas superficies degradan a su
fondo local (tinte plano del contorno / paleta hipsométrica del relieve). En
el mapa de Chile los tiles se **recortan al contorno nacional** (`clipPath`
del SVG), y el relieve 3D toma su fondo del mismo token `--night` del visor.

Desde `simulacion/`:

```bash
python -m http.server 8000
```

Abrir <http://localhost:8000/web-conectividad/>.

Para compartir una sesión temporal, en otra terminal y con el servidor local activo:

```bash
cloudflared tunnel --url http://127.0.0.1:8000
```

La URL `trycloudflare.com` que entregue Cloudflare sólo dura mientras el túnel siga activo; no se versiona como enlace permanente.

## Las tres vistas (ADR 0016; rediseño «Red Austral», noviembre de 2026)

1. **Inicio** (`#view-inicio`): portada editorial — héroe cobalto con haz de
   rayos, problema con cifras verificadas en bloques con filete de tinta
   (Fundación País Digital «Hogares Conectados 2026», SUBTEL, LGUC 116 bis
   F), solución en tres pasos numerados (datos reales, motor exacto ESU +
   unión incremental, verificación con oráculo) y llamado al atlas con los
   totales calculados en vivo desde los `metrics.json` versionados.
2. **Mapa** (`#view-mapa`): noche blueprint con los tiles OSM recortados al
   contorno continental (`assets/chile.json`, Natural Earth 1:50m, dominio
   público) y las 827 localidades de los pilotos como puntos de señal en
   `assets/localities.json` (generado desde los `demand_points.geojson`
   versionados). Clic en cualquier punto abre la **carta de impacto social**
   desde la derecha — coordenadas en formato cartográfico, secciones
   numeradas (historia y conectividad, segmento socioeconómico, situación
   actual, impacto proyectado), ficha técnica con los números reales de
   `metrics.json` y fuentes citadas. El botón «Ver la simulación de la
   zona» cierra la carta, anima el `viewBox` del SVG hacia la zona (~1,5 s)
   y entrega el visor 3D.
3. **Simulación** (`#view-sim`): controles arriba a la izquierda — volver
   al mapa, nombre de la zona, zoom `−`/`+` con lectura «×n.n», «Iniciar
   simulación» (reproduce las fases), «Reiniciar» (paso 0 y cámara al
   encuadre original) y «Restricciones» — y leyenda abajo a la izquierda
   (elevación, densidad, población afectada por estado y rango ρ(a)). El
   recorrido de fases vive en la esquina inferior derecha. Bajo el lienzo,
   «Cómo se aplicó el algoritmo» conserva su formulación matemática y sus
   filas modelo→dato en papel editorial.

## Relieve 3D (todos los pilotos)

Biobío, Metropolitana y Yumbel se presentan como mapa 3D de la región a todo el ancho: malla construida desde `outputs/<piloto>/terrain.json` (grilla 320, ADR 0010) con tinta hipsométrica por vértice (la misma rampa del mapa PNG, exportada por el pipeline), luz direccional 315°/45° igual al hillshade del PNG, órbita con arrastre, zoom con rueda o botones `+`/`−`, y **relieve con exageración vertical moderada (×2,5, la misma convención del hillshade del PNG; ADR 0013 revisa ADR 0009)**: a escala ×1 el desnivel de estas ventanas (≤3 % del ancho) apenas se percibe; ×2,5 lo hace legible sin deformar la forma del terreno.

La subdivisión territorial es parte del terreno (una misma dimensión): cada localidad se pinta como subconjunto de la grilla del DEM con una **coropleta de densidad de población (hab/km², 5 clases por cuantiles**; Brewer & Pickle 2002; ADR 0009, layout revisado en ADR 0010), iluminada como el relieve. Por construcción cada celda pertenece a lo sumo a una localidad: las zonas siguen el relieve vértice a vértice y nunca se superponen. Los puntos marcan localidades (tamaño ∝ √población), neutros hasta el paso de solución; ahí cada localidad muestra su **estado de cobertura** (ADR 0014): las esferas toman el color de cubierta / alcanzable / sin alcance y las no cubiertas atenúan su coropleta, que conserva el tono de densidad.

**Cobertura como rango (ADR 0011, revisado en ADR 0012)**: en el paso "Cobertura posible" cada candidata que alcanza al menos una localidad muestra su rango ρ(a) como anillo drapeado al relieve (recortado a la ventana del DEM); en la solución, sólo las elegidas mantienen su anillo y disco (más marcados). Sin volumen 3D: un hemisferio de radio ρ(a) sugería una estructura masiva y un alcance vertical que la señal no tiene. El rango viene de `candidates.geojson.radius_m` (radio por clase de potencia; sin clases, `max_distance_m`). Es el límite de distancia de la antena, no una certificación de cobertura radioeléctrica: el visor no recalcula LOS. Pilotos anteriores sin `radius_m` piden regenerarse con el pipeline actual.

**Carta de restricciones aplicadas (ADR 0015)**: el botón «Restricciones» abre una carta lateral deslizante con una fila por restricción realmente aplicada en la corrida cargada — territoriales y de modelo —, parámetros vivos del manifiesto, conteos del audit y la equivalencia matemática que aplica el motor (cadena C₀→Cₙ). Al pasar el cursor o enfocar una fila, su representación se **ilumina en el mapa** — anillos d_sep, cruces de rechazos, cruces de excluidos, zonas PRC, área, rangos ρ(a), enlaces, solución — y un clic la fija.

Debajo de la simulación, **"Cómo se aplicó el algoritmo"** muestra cuatro fases (candidatos del criterio, cobertura distancia+LOS, selección exacta del motor, red conectada) con los números reales del escenario cargado (evaluaciones, tiempos, población; contraste con el baseline goloso). Cada tarjeta sincroniza el mapa con su fase. Bajo las tarjetas: **"Formulación matemática"** (el modelo exacto y los cinco pasos del motor, fiel a `docs/algoritmo-conectado.md`) y **"Elementos del modelo → datos reales"** (cada objeto del modelo anclado en el archivo que lo produce, con chips de valores vivos). Cada fila es clicable y sincroniza el mapa con su fase.

`terrain.json` es un artefacto de comunicación (ADR 0003): nunca se recalcula LOS desde él. Si el piloto no tiene `terrain.json` o carece de paleta, el visor avisa que hay que regenerar el piloto (el antiguo mapa 2D SVG se retiró con ADR 0016: los tres pilotos versionados tienen relieve).

La conectividad exige un único componente de antenas seleccionadas. No representa gateway, capacidad, permisos ni cobertura radioeléctrica certificada. El PRC se muestra como screening, nunca como permiso de construcción (ADR 0005).

## Añadir o regenerar un piloto

1. Correr el pipeline con la config correspondiente en `simulacion/configs/`.
2. Si el piloto es nuevo: añadir su entrada en `zones.js` (nombre, centro,
   directorio de salida, contenido de la carta con fuentes) y regenerar
   `assets/localities.json` desde su `demand_points.geojson`.

```bash
uv run python - <<'EOF'
import json
zones = {"mi-piloto": "outputs/mi-piloto"}
points = {}
for key, directory in zones.items():
    with open(f"{directory}/demand_points.geojson") as f:
        fc = json.load(f)
    points[key] = [[round(f["geometry"]["coordinates"][0], 4), round(f["geometry"]["coordinates"][1], 4), int(f["properties"]["population"])] for f in fc["features"]]
# mezclar con los existentes antes de escribir assets/localities.json
EOF
```

## Estructura

```text
web-conectividad/
  index.html        tres vistas (portada editorial + atlas + simulación) y cartas
  styles.css        tokens del sistema Red Austral (papel/cobalto/noche/señal)
  fonts.css         @font-face de las fuentes vendidas (assets/fonts, OFL)
  app.js            estado, carga de artefactos, recorrido, controles
  map.js            proyección del mapa de Chile, puntos y zoom animado
  zones.js          metadatos de zonas y cartas de impacto social (con fuentes)
  terrain-view.js   escena 3D (three.js vendido; no toca el motor)
  osm-tiles.js      ensamblado de tiles OSM en runtime (ADR 0017)
  assets/           chile.json + localities.json + fonts/ (vendidos, sin red)
  vendor/           three.module.min.js, three.core.min.js, OrbitControls.js
  assets/radio-tower.svg  ícono Radio Tower de GitHub Octicons (MIT), vía Wikimedia Commons: https://commons.wikimedia.org/wiki/File:Octicons-radio-tower.svg
```

# Plan de visualización: relieve hipsométrico (2D) y mapa 3D web

Estado: plan aprobado; stack 3D decidido el 2026-11-07 (three.js vendido,
ADR 0008). Implementación pendiente. Rama `presentacion-web`.
Alcance: presentación visual de las regiones modeladas. **No** toca el motor, la
enumeración de pares con LOS, la generación de candidatos ni la semántica PRC
(ADR 0005).

## 1. Objetivo

1. **Mapa topográfico 2D** por piloto con **tintas hipsométricas** (color por
   elevación) + sombreado del relieve, reemplazando el fondo plano actual de
   `map.png`.
2. **Visor web con mapa 3D** de la región modelada (relieve navegable).
3. **Antenas y enlaces en el 3D: cobertura como rango ρ(a) (ADR 0011).**
   Posiciones reales del escenario; el rango de cada antena se dibuja como
   anillo/disco drapeado al relieve y, en la solución, domo translúcido 3D.
   Los marcadores cónicos y segmentos de enlaces siguen genéricos.
4. **Densidad de población: coropletas por cuantiles (hab/km²) integradas al
   terreno** (ADR 0009, con fundamento en Brewer & Pickle 2002 y Slocum et al.);
   relieve 3D a escala real sin exageración.

## 2. Estado actual (hecho verificado)

- `src/visualization/map.py`: `export_map` dibuja localidades, candidatas,
  solución, límite del área sobre fondo blanco. Sin DEM.
- `src/visualization/terrain.py`: `terrain_payload` reduce el GeoTIFF a
  `terrain.json` (grilla bilinear ≤96×96, bounds WGS84 + métricos, min/max).
  `pipeline.py:330` lo escribe en cada corrida.
- `web-conectividad/app.js`: visor estático sin dependencias; sólo Yumbel tiene
  relieve 3D: proyección propia Canvas 2D, quads ordenados por profundidad
  (painter's algorithm), color por elevación con 4 paradas fijas **sin
  sombreado**, exageración vertical 10×, cámara yaw/pitch fija con arrastre.
- ADR 0003: el visor renderiza sin dependencias de frontend y `terrain.json` es
  sólo un artefacto de comunicación (no se recalcula LOS desde él).
- Datos: el DEM se descarga de Copernicus 30 m (S3) en `prepare_dem`; los RAR
  no están versionados. Las corridas de verificación de los tres pilotos en
  `outputs/` están versionadas en git (corridas nuevas siguen ignoradas).

## 3. Base cartográfica (literatura y proyectos)

**Tintas hipsométricas.** Clásicas (Imhof, *Cartographic Relief Presentation*):
verde → ocre → marrón → blanco por banda de elevación. Problema documentado:
se leen como vegetación/clima y no como altura. Patterson & Jenny (2011,
*Cartographic Perspectives* 69, doi:10.14714/CP69.20) proponen **tintas
cross-blended**: el color de tierras bajas se adapta al entorno de la región
(árido vs. húmedo) y las paradas superiores convergen (marrones → grises →
blancos). Evaluación de usuarios en CP75 (doi:10.14714/CP75.578).

Valores concretos reutilizables: `tidyterra::cross_blended_hypsometric_tints_db`
(tabla `pal, limit, hex`). Rampa `arid` completa (válida para Metropolitana;
Yumbel/Biobío → variante húmeda de la misma tabla, transcribir al implementar):

| límite (m) | hex |
|---:|---|
| 0 | `#A0988D` |
| 50 | `#AAA096` |
| 200 | `#B4AA9E` |
| 600 | `#CABEAE` |
| 1000 | `#D4C9B4` |
| 2000 | `#D4B8A3` |
| 3000 | `#D4C1B3` |
| 4000 | `#D4CFCC` |
| 5000 | `#DCDCDC` |
| 6000 | `#EBEBED` |

Regla clave: **recortar la rampa al rango real de la región** (remapear
`limit` → `[min_elev, max_elev]` de la instancia); con una rampa 0–6000 m sobre
una ventana de 0–900 m se usa <15 % del cromatismo.

**Sombreado.** Hillshade clásico az 315°, alt 45°; multidireccional como
alternativa para recuperar detalle (Esri). Composición tinta × sombra en modo
soft/multiply — el patrón estándar es *hypsometrically tinted shaded relief*
(patrón de leyenda de Esri para ese caso).

**3D web (proyectos conocidos).** Todos comparten el patrón grilla DEM → malla
→ sombreado por normales + tinta por elevación:

| Proyecto | Mecanismo | Encaje aquí |
|---|---|---|
| Qgis2threejs | exporta DEM → escena three.js | precedente directo del enfoque B |
| deck.gl `TerrainLayer` | malla desde imágenes de altura (Terrain-RGB) | pensado para tiles en red |
| MapLibre `setTerrain` | raster-dem (Terrain-RGB/terrarium) | idem, tiles externos |
| Cesium | quantized-mesh, escala globo | sobredimensionado |

Tiles abiertos (AWS terrarium) existen, pero obligan a dependencia de red y
terceros para una región que ya tenemos localmente en el GeoTIFF.

## 4. Stack 3D del visor: decisión registrada

| Opción | Qué es | A favor | En contra |
|---|---|---|---|
| A | Mejorar el Canvas actual (sin deps) | cumple ADR 0003 tal cual | painter's algorithm: sin AA, cracks, fps se degrada >~120² celdas en drag |
| B (adoptada) | **three.js vendido** en `web-conectividad/vendor/` (ES module, sin build, sin red) | normales suaves, luz real, OrbitControls gratis; precedido por Qgis2threejs; sigue estático y offline | requería revisar ADR 0003 → resuelto en ADR 0008; ~600 kB vendidos |
| C | deck.gl/MapLibre + tiles externos | estética de producto | red + tiles de terceros; contradice el carácter estático; cambios de contrato |

Decisión (2026-11-07): **B — three.js vendido**. El salto de calidad es el
objetivo de la rama y el costo es un ADR revisado (0008) más archivos vendidos,
no una dependencia viva de red.

## 5. Cambios propuestos por fase

### V1 — Tintas hipsométricas en el mapa 2D (`map.py`)

- Nuevo módulo de relieve (p. ej. `src/visualization/relief.py`): lee el DEM ya
  recortado por el pipeline, re-muestrea al tamaño de la figura
  (`Resampling.bilinear`), calcula hillshade (`matplotlib.colors.LightSource`,
  az 315°, alt 45°, `vert_exag` acorde a la resolución) y compone tinta+sombra.
- Colormap: `LinearSegmentedColormap` desde la rampa cross-blended recortada al
  rango de la instancia + `BoundaryNorm` con quiebres redondos (p. ej. cada
  100–250 m según rango) → leyenda de clases discretas con unidades en m
  (español). `NoData` → gris neutro con trama, nunca color de elevación.
- Orden de capas: sombra+tinta → límite del área → exclusiones PRC (screening,
  rojo, con la leyenda "sin clasificación ≠ prohibido" según ADR 0005) →
  localidades → candidatas → solución. La capa de población se mantiene como
  está hoy (su representación se decide después).
- `export_map` gana un parámetro de ruta al DEM; regenerar los tres pilotos.

### V2 — `terrain.json` mejorado (`terrain.py`)

- `max_side` configurable (default 96 → 160 para alimentar la malla 3D;
  bilinear se mantiene; sigue prohibido usarlo para recálculo).
- Añadir `palette` al payload: `{name, stops: [{limit_m, hex}]}` — la misma
  rampa de V1, para que 2D y 3D compartan tinta exacta (una sola fuente).

### V3 — Mapa 3D web (visor)

`web-conectividad/vendor/three.module.js` + OrbitControls vendidos (ES modules,
sin build ni red); `terrain-view.js` nuevo módulo: `BufferGeometry` desde
`terrain.json` (grilla → vértices con z = exageración ajustable, default 10×),
color por vértice según `palette`, `DirectionalLight` az 315°/alt 45°
(consistente con el 2D), OrbitControls con límites (no bajo el horizonte),
`prefers-reduced-motion` respetado. Placeholders: marcador cónico por antena
en su coordenada real (leída del escenario, geometría genérica) y enlaces como
segmentos entre cimas; toggles propios, leyenda es-CL igual a la 2D. Biobío y
Metropolitana pasan a tener relieve (hoy sólo Yumbel); el ejemplo didáctico
conserva Canvas/SVG. Sin construir nada: `python -m http.server`.

### V4 — Verificación (al implementar)

- `uv run pytest -q` sigue verde (el motor no cambia).
- Regenerar los tres pilotos a `outputs/` nuevos; comparar óptimos contra la
  regresión obligatoria (Biobío 80,44 %, Metropolitana 88,64 %) — la capa visual
  no debe alterar resultados.
- Visor servido con `http.server`, verificado en navegador (capturas): rampa
  idéntica 2D/3D, leyendas, NoData, fps en drag, placeholders visibles.
- Actualizar el README del visor en el mismo commit (ADR 0008 ya registrado).

## 6. Fuera de alcance

- Integración de la solución exacta en la escena 3D (los marcadores son
  placeholders hasta decidir).
- Mapeo dasimétrico de densidad (requiere datos auxiliares de ocupación del
  suelo; ADR 0009 lo declara como refinamiento futuro).
- Cualquier cambio al motor, LOS, candidatos o semántica PRC.

## 7. Referencias

- Imhof, E. *Cartographic Relief Presentation.*
- Patterson, T. & Jenny, B. (2011) *The Development and Rationale of
  Cross-blended Hypsometric Tints*, Cartographic Perspectives 69,
  doi:10.14714/CP69.20; evaluación CP75 doi:10.14714/CP75.578;
  shadedrelief.com/hypso.
- Esri: *Hypsometric tinting*; leyenda para shaded relief hipsométrico;
  `Hillshade function` (multidireccional).
- ETH Zürich ikgrelief: *Hypsometric Colours*.
- tidyterra `cross_blended_hypsometric_tints_db` (valores `limit`+`hex`).
- Qgis2threejs (docs del plugin); deck.gl `TerrainLayer`; MapLibre
  `setTerrain` + Terrain-RGB/terrarium; Cesium quantized-mesh.
- Internos: ADR 0003, ADR 0005, `docs/algoritmo-conectado.md`.

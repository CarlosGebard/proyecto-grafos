# ADR 0008: Relieve 3D del visor con three.js vendido

## Contexto

El visor muestra el relieve de Yumbel con Canvas 2D y painter's algorithm
(ADR 0003). Esa técnica alcanzó su techo: sin antialiasing, artefactos de
orden por profundidad y fps degradado sobre ~120² celdas — insuficiente para
el objetivo de la rama `presentacion-web`: presentar cada región modelada
como un mapa 3D navegable con tintas hipsométricas consistentes con el mapa
2D. Las alternativas con tiles (deck.gl `TerrainLayer`, MapLibre `setTerrain`)
dependen de red y tiles de terceros para una región cuyo DEM ya está local.
Qgis2threejs demuestra el patrón DEM → three.js en visores estáticos sin
paso de build.

## Decisión

El relieve 3D de los pilotos se renderiza con **three.js vendido** en
`web-conectividad/vendor/` (ES module + OrbitControls como archivos
versionados, sin build ni descarga en runtime). La malla se construye desde
`terrain.json` con color por vértice según la misma rampa hipsométrica del
mapa 2D (exportada en `terrain.json.palette`), luz direccional az 315°/alt 45°
idéntica al hillshade 2D, exageración vertical ajustable y OrbitControls
acotados. Esto revisa ADR 0003 en lo relativo a dependencias: el visor sigue
siendo estático y funcional offline (archivo vendido, sin CDN), y
`terrain.json` sigue siendo un artefacto de comunicación que no recalcula
LOS. Las vistas didácticas pequeñas conservan Canvas/SVG.

## Consecuencias

- ~600 kB de archivos vendidos versionados; sin dependencias vivas de red ni
  paso de build.
- El painter's algorithm se retira para el relieve de los pilotos; el ejemplo
  didáctico no cambia.
- La tinta 2D y 3D comparte una única fuente: la paleta exportada en
  `terrain.json`.
- Antenas y enlaces entran a la escena como placeholders (posición real,
  geometría genérica); su integración con la solución se decide después.

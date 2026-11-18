# ADR 0015: Carta de restricciones aplicadas en el visor (hover ↔ mapa)

## Contexto

Cada simulación aplica muchas restricciones — territoriales (área, pendiente,
NoData, proximidad, tope, PRC, establecimientos sensibles) y de modelo
(clases de potencia ρ(a), cobertura distancia+LOS, conectividad, gateway,
umbral t, presupuesto k, presupuesto de evaluaciones) — pero el visor sólo
hacía visible una: las zonas PRC (botón «Restricciones PRC»).

Problemas concretos:

- Las restricciones de filtro de candidatos (pendiente, NoData) descartaban
  puntos **antes** de que existieran candidatos: el audit del manifiesto
  contaba los descartes (`excluded_slope`, `excluded_nodata`), pero ningún
  artefacto los ubicaba en el mapa.
- El PRC se mostraba por sola presencia de `constraints.geojson`: Biobío y
  Metropolitana tienen el archivo versionado de eras anteriores, pero sus
  corridas (`prc_directory: None`) **no** aplicaron PRC. El visor dibujaba
  esas zonas igual, sugiriendo un filtro que no se aplicó.
- La equivalencia matemática de cada restricción (la regla que aplica el
  motor) vivía dispersa entre `docs/algoritmo-conectado.md`, ADR 0005/0007 y
  el panel «Formulación matemática», sin anclaje fila-a-fila con el mapa.

## Decisión

- **Carta lateral deslizante** (`web-conectividad/index.html`:
  `.constraint-drawer`, botón «Restricciones (n)» en `canvas-actions`): una
  fila por restricción **realmente aplicada** en la corrida cargada, en dos
  grupos — territoriales y de modelo. Cada fila muestra: parámetros vivos
  (θ_max, d_sep, N_max, t, k, E_max…), conteos del audit del manifiesto, la
  **equivalencia matemática** en notación del modelo (cadena de filtros
  C₀→Cₙ numerada según lo aplicado en esa simulación) y la fuente (ADR).
- **Hover/focus ilumina en el mapa**; un clic fija (útil en táctil); Escape
  cierra. El mapa SVG y la escena 3D comparten las claves de capa
  (`area`, `slope`, `nodata`, `proximity`, `cap`, `ranges`, `coverage`,
  `links`, `prc-exclusion`, `prc-unknown`, `sensitive`, `solution`).
  Las filas sin representación cartográfica (gateway con G=∅, presupuesto de
  evaluaciones, capas no declaradas) quedan marcadas y no iluminan nada.
- **Nuevos artefactos del pipeline** (sólo exportación; el motor no cambia):
  - `candidate_rejections.geojson`: puntos descartados **dentro del área**
    por filtros del DEM (`reason=slope|nodata`, con `slope_deg` y
    `elevation_m`). `generate_candidates` los colecta con
    `collect_rejections=True`; `write_candidate_rejections` los escribe en
    WGS84 con tope determinista de 5.000 por razón (paso constante sobre el
    orden por clave). Los descartes de proximidad y tope **no** se exportan:
    su representación es el anillo d_sep y el conteo del audit.
  - `rejections_file` / `rejections_exported` quedan en el audit del
    manifiesto.
- **Capas nuevas en el visor**: anillos de separación d_sep por candidato
  (drapeados en 3D, polígono proyectado en SVG, color petróleo `#1f7a8c`),
  cruces de rechazos pendiente/NoData (rojo acento / gris), cruces de
  candidatos excluidos por PRC o establecimientos sensibles (desde
  `excluded_candidates.geojson`), y borde del área de estudio drapeado (tenue
  por defecto, iluminado al pasar por «Área de estudio»).
- **PRC honesto**: la corrida sólo cuenta PRC como aplicado si el manifiesto
  lo declara (`prc_constraints` en el audit o `prc_directory` en la config).
  Si no, un `constraints.geojson` heredado se lista como «no aplicada —
  capas disponibles, no filtran en esta corrida», la capa se oculta y el
  botón «Restricciones PRC» desaparece. Exclusiones duras y zonas sin
  clasificación se iluminan por separado (filas distintas).
- `scenario.candidates` excluye los candidatos con
  `constraint_status="excluded"`: se dibujan como cruces de exclusión, no
  como torres/candidatas (importante si una corrida futura excluye por PRC o
  sensibles).

## Consecuencias

- Los tres pilotos versionados ganan el artefacto nuevo regenerando **sólo
  la etapa de candidatos** con los mismos insumos (dem.tif y
  demand_points.geojson de cada corrida): Biobío sin rechazos de DEM (sin
  archivo), Metropolitana 2 (pendiente), Yumbel 1.980 (pendiente). El audit
  se verifica contra el manifiesto antes de escribir; la única desviación
  conocida es `excluded_proximity` en Yumbel (590.916 vs 590.917): un bit de
  una coordenada al reconstruir demandas desde GeoJSON mueve un descarte de
  proximidad junto al umbral flotante — no afecta el artefacto (sólo
  pendiente/NoData, verificado estricto) ni a candidatos conservados.
- Corridas nuevas generan el artefacto solas; las antiguas degradan sin
  error (filas con conteo, sin capa que iluminar).
- El estado del recorrido (pasos 1–4) no cambia: la carta **adelanta**
  estados del modelo mientras el hover dura (la solución se ve en el paso 1
  con «k» en hover) y lo restaura al salir. Los readouts siguen atados al
  paso real.
- El mapa PNG no cambia: la carta es interactiva por definición; el PNG ya
  lleva su propia leyenda estática.
- Mantener la regla ADR 0005 intacta: la carta muestra el screening, nunca
  lo presenta como permiso («sin clasificación ≠ prohibido», «sin capa
  declarada = limitación de datos»).

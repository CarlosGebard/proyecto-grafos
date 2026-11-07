# Estado del proyecto

Última verificación: 7 de noviembre de 2026.

## Fase actual

Motor exacto conectado implementado en `feat/algoritmo` (cutover de la fuerza bruta). Pilotos revalidados. Informe final (fase 3) redactado y compilado.

## Resuelto

- Grafo: candidatos ↔ localidades.
- Arista: distancia válida + LOS sobre relieve.
- Conectividad/LOS entre antenas: grafo `G_conn` ya construido por `src/geo/coverage.py:compute_connectivity` (enlace usa `min(ρu, ρv)` con radios por clase de potencia).
- Objetivo: hasta `k` antenas, máxima población única cubierta (unión incremental, no suma por antena).
- Solución exacta: enumeración ESU de subconjuntos conexos (`src/algorithms/connected.py`), con cota, desempate lexicográfico, gateway opcional y umbral `t`; baseline goloso para contraste. Fuerza bruta eliminada; ver [ADR 0006](simulacion/docs/adr/0006-motor-esu-gateway-potencia-umbral.md).
- Candidatos por criterio (ADR 0007): anclas en localidades + intersecciones Murray–Tong + sitios altos del DEM; filtros de pendiente, proximidad y establecimientos sensibles (OGUC 116 bis E / Ley 20.599). La retícula regular quedó eliminada.
- Pilotos con criterio (ADR 0007, `k=5`); los tres superan a la retícula: Biobío 85,35 % (4.467/5.234, +4,91 p.p.), Metropolitana 92,65 % (26.254/28.337, +4,01 p.p.), Yumbel con clases 39,01 % conectado (12.063/30.923, +10,07 p.p.; separación de 4 km ≈ √(área/n)).
- Presentación visual (rama `presentacion-web`, ADR 0008/0009/0010/0011): mapa PNG con tintas hipsométricas cross-blended + hillshade (`src/visualization/relief.py`, rampas de Patterson & Jenny 2011 en `palettes.py`) y coropletas de densidad (hab/km², cuantiles); visor web horizontal con relieve 3D a escala real (three.js vendido, sin build ni red), subdivisión pintada sobre la grilla del DEM (zonas sin superposición), recorrido del algoritmo con números reales, candidatas removidas en la solución y zoom con botones; **cobertura como rango nominal ρ(a) de antena** (anillo drapeado al relieve por candidata en el paso de cobertura; disco + domo translúcido 3D para las elegidas en la solución; `candidates.geojson` exporta `radius_m`, ADR 0011); `terrain.json` exporta la paleta para que PNG y 3D compartan tinta (grilla 320, compacta). Plan: [plan-visualizacion-relieve.md](simulacion/docs/plan-visualizacion-relieve.md).
- Corridas de verificación del 7 de noviembre de 2026 en `outputs/{metropolitana,biobio,yumbel-criterio}/` (versionadas en git): **Metropolitana reprodujo 26.254 hab (92,65 %) idéntico a ADR 0007** (mismo DEM Copernicus). Biobío (3.752 hab) y Yumbel (9.399 hab conectado, umbral t=5.000 con 1 antena) corrieron con `--dem-source copernicus` porque el RAR ALOS de Biobío no estaba disponible localmente: el óptimo cambia respecto a ADR 0007 por el cambio de fuente DEM, no por el motor.
- Informe final (fase 3): [fuente](informe/informe-final.tex) y [PDF](informe/entregables/informe-final.pdf) — mapeo a PartialConRBDS, techo teórico documentado (Teoremas 1, 2 y 4 del paper ITCS), datos concretos de fase 0 y tabla greedy-vs-exacto (razón 1,000 en los tres pilotos, con 17–78× menos evaluaciones).

## Pilotos disponibles

| Piloto | Resultado exacto reproducido tras el cutover |
| --- | --- |
| Biobío | 5 ubicaciones cubren 4.210 de 5.234 habitantes (80,44 %); conectado 9.922 evaluaciones vs 21.700 combinaciones. |
| Metropolitana | 5 ubicaciones cubren 25.119 de 28.337 habitantes (88,64 %); conectado 4.394 evaluaciones vs 11.672 combinaciones. |

Las corridas de regresión del cutover están en `simulacion/outputs/biobio-regresion-esu/` y `simulacion/outputs/metropolitana-regresion-esu/`; la corrida de validación con clases de potencia, gateway y umbral en `simulacion/outputs/yumbel-clases-2/` y `simulacion/outputs/yumbel-gateways/`.

## Pendiente

- Censo 2024.
- Modelo radioeléctrico, permisos, costos y factibilidad real.

## Límites declarados

- Los presets regionales son ventanas piloto, no regiones administrativas completas.
- El modelo representa cada localidad mediante un punto interior; no certifica cobertura radioeléctrica ni la factibilidad de instalación. Ver [documento explicativo](simulacion/docs/documento-explicativo.md).

## Para continuar

1. Ejecutar el piloto Biobío siguiendo el [README principal](README.md).
2. Consultar parámetros, datos y salidas en el [runbook](simulacion/docs/runbooks/pipeline.md).
3. Usar un directorio nuevo dentro de `simulacion/outputs/` para cada simulación.

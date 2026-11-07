# ADR 0006: motor exacto ESU, gateway, clases de potencia y umbral de cobertura

Estado: aceptada. Fecha: 2026-11-06. Reemplaza el placeholder de fuerza bruta de `src/algorithms/exact.py` (eliminado) descrito en la retroalimentación del profesor.

## Contexto

La V1 resolvía cobertura máxima por enumeración de combinaciones (`itertools.combinations` + BFS por conjunto): `Σ C(n,r)` conjuntos, insostenible más allá de ~28 candidatos y señalado por el profesor como placeholder. La especificación aprobada ([algoritmo-conectado](../../../../docs/algoritmo-conectado.md), basada en PartialConRBDS, ITCS 2026) fija el régimen exacto `Δ(G_conn)` acotado: enumerar sólo subconjuntos conexos. Además faltaban tres extensiones del modelo pedidas en la retroalimentación: gateway con salida a Internet, radio efectivo por clase de potencia y umbral de población `t`.

## Decisión

1. **Motor exacto** (`src/algorithms/connected.py`): enumeración canónica de subconjuntos conexos por **ESU** (Wernicke 2006). La regla de extensiones es el vecindario exclusivo `Nexcl(a, S) = N(a) ∖ N(S)` con id mayor que la raíz; cada conexo ≤ k se genera exactamente una vez (verificado contra oracle por BFS y exhaustivamente en todos los grafos de 4 y 5 vértices). El objetivo se mantiene como **unión incremental** (`cover[d]` con traza), nunca suma por antena. Poda con la cota estática de prefijos, sólo con comparación estricta (`< best_f`): el desempate lexicográfico es reproducible porque nunca se poda por empate. `resolver` resuelve la variante libre (`connectivity=None`, clique) y la conectada con el mismo código.
2. **Presupuesto**: `max_combinations` → `max_evaluations` con la misma semántica de `ExactLimitExceeded` (protección de peor caso; la ejecución termina con error).
3. **Gateway**: `gateways` (TOML/CLI, ids de candidatos). Se exige `S ∩ G ≠ ∅` en la solución conectada y en la de decisión; `None` = sin requisito, lista vacía = error.
4. **Clases de potencia**: tablas `[[antenna_class]]` (nombre, `radius_m`, `count`) con valores de referencia de `docs/referencias-potencia-antenas.md`. El radio se adjunta a `AntennaCandidate.radius_m`; `compute_coverage` usa `ρ(a)` y `compute_connectivity` usa `min(ρ(u), ρ(v))`. Sin clases, `ρ(a) = max_distance_m` (retrocompatible con los pilotos). Asignación determinista: candidatos ordenados por id, clases en el orden del TOML.
5. **Umbral `t`**: `min_population` + `min_antenas_para_objetivo` (mínimo `m ≤ k` con `f(S) ≥ t`; `None` certifica inalcanzable). El goloso (`greedy_conectado`) es baseline de comparación, nunca reemplazo del exacto.
6. `Solution` expone `evaluations`; `metrics.json` lo incluye para medir el contraste evaluaciones-vs-combinaciones.

## Consecuencias

- Los pilotos se reproducen idénticos tras el cutover: Biobío 4.210 hab (80,44 %) y Metropolitana 25.119 hab (88,64 %), con menos evaluaciones que combinaciones del placeholder (Biobío conectado: 9.922 vs 21.700; Metropolitana: 4.394 vs 11.672).
- El motor es agnóstico de la capa geográfica: los límites del modelo (pares, punto interior, sin difracción, NoData) siguen viviendo en `geo/` y no se duplican.
- La variante libre visita todos los tamaños `≤ k` (antes sólo tamaño `k`): con `n` grande puede necesitar más presupuesto que antes; el mensaje de error lo indica.
- PRC sigue siendo screening territorial; nada de esto certifica factibilidad de instalación (Ley 20.599) ni cobertura radioeléctrica real.

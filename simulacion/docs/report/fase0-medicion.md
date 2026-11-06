# Fase 0: medición del régimen Δ(G_conn) en los pilotos

Ejecución de `docs/report/medicion_fase0.py` sobre las corridas de regresión del
cutover (noviembre 2026). Insumo del informe (fase 3): valida que el régimen
exacto `Δ(G_conn)` acotado de la especificación (§5) sostiene los pilotos y
cuantifica el solape que obliga a optimizar la unión y no la suma por antena.

Los `fase0.json` con los números crudos están en cada directorio de salida.

## Resultados (k = 5)

| Métrica | Biobío | Metropolitana | Yumbel (clases 30/12/6 km) |
| --- | ---: | ---: | ---: |
| Candidatos `n` | 20 | 19 | 23 |
| Aristas `G_conn` | 82 | 62 | 11 |
| `Δ̄` | 8,2 | 6,5 | 0,96 |
| `Δ` máx | 13 | 11 | 3 |
| Antenas aisladas | 0 | 0 | 10 |
| Combinaciones totales `Σ C(n,r≤5)` | 21.699 | 16.663 | 44.551 |
| **Subconjuntos conexos reales ≤ k** | **9.922** | **4.394** | **84** |
| Reducción por ESU | 54 % | 74 % | 99,8 % |
| Mayorante teórico de [3] (con Δ máx) | 2,34·10⁷ | 1,08·10⁷ | 2,46·10⁴ |
| Tasa de poda (cota de prefijos) | 0 % | 0 % | 0 % |
| Pares de candidatos con solape | 132 | 117 | 38 |
| Solape medio / máximo (todos los pares) | 2,98 / 15 | 41,8 / 103 | 2,18 / 10 |
| Pares enlazados con solape (de las aristas) | 73 / 82 | 62 / 62 | 11 / 11 |
| Solape medio / máximo entre enlazadas | 3,68 / 11 | 54,7 / 103 | 3,82 / 10 |
| Exacto conectado (hab) | 4.210 | 25.119 | 8.950 |
| Razón goloso/exacto | 1,000 | 1,000 | 1,000 |

## Lectura

1. **El régimen Δ acotado se confirma**: enumerar sólo conexos reduce el espacio
   54 %–99,8 % según la densidad de `G_conn`. Con clases de potencia (Yumbel), el
   corte por `min(ρu, ρv)` + LOS deja `Δ̄ < 1` y el espacio conexo colapsa a 84
   conjuntos, mientras la enumeración combinatoria crece a 44.551.
2. **La cota de prefijos (I3) no poda nada en estas instancias**: la tasa es 0 %
   porque `prefix[m]` suma los pesos totales de las mejores antenas, y con
   radios de 30 km cada total ≈ la población de toda la ventana. La economía del
   motor viene de ESU (no generar desconectos), no de la poda. Si se necesitara
   poda real en instancias mayores, la vía es una cota por vecindario (no
   comprometida en la spec); por ahora el hallazgo se registra tal cual.
3. **El solape justifica el objetivo-unión**: en Metropolitana las antenas
   enlazadas comparten en media 55 localidades (máx 103): optimizar la suma por
   antena sobredimensionaría el cobertura. Esto es el comentario del profesor
   ("no sólo sumar cardinalidad") cuantificado.
4. **El goloso empató al exacto en los tres pilotos** (razón 1,000): consistente
   con instancias pequeñas y densas; la utilidad del contraste aparecerá en
   instancias mayores donde se registre brecha.

Metodología: conteo de conexos con el propio motor (`resolver` con `poda=False`,
invariante I1 ya validado contra oracle y exhaustivamente en grafos de 4 y 5
vértices); solapes por pares sobre `graph.json`; enlaces sobre `connectivity.json`.

## Medición sobre la generación por criterio (ADR 0007, noviembre 2026)

Re-ejecución de `medicion_fase0.py` sobre las corridas con candidatos por
criterio y filtro de proximidad (`outputs/biobio`, `outputs/metropolitana`,
`outputs/yumbel-criterio`). La tabla anterior queda como registro de la
retícula regular.

| Métrica | Biobío | Metropolitana | Yumbel (criterio, clases 30/12/6 km) |
| --- | ---: | ---: | ---: |
| Candidatos `n` (tope activo) | 40 | 40 | 25 |
| Puntos crudos generados | 6.935 | 95.878 | 754.626 |
| Excluidos por proximidad | 108 | 249 | 578.495 |
| Aristas `G_conn` | 503 | 450 | 123 |
| `Δ̄` | 25,15 | 22,5 | 9,84 |
| `Δ` máx | 35 | 35 | 16 |
| Combinaciones totales `Σ C(n,r≤5)` | 760.098 | 760.098 | 68.405 |
| Subconjuntos conexos reales ≤ k | 415.140 | 360.107 | 26.982 |
| Reducción por ESU | 45 % | 53 % | 61 % |
| Mayorante teórico de [3] (con Δ máx) | 2,95·10⁹ | 2,95·10⁹ | 7,08·10⁷ |
| Tasa de poda (cota de prefijos) | 0 % | 0 % | 0 % |
| Pares con solape / media / máx | 722 / 8,2 / 41 | 563 / 86,7 / 258 | 234 / 4,24 / 30 |
| Pares enlazados con solape (de las aristas) | 497 / 503 | 450 / 450 | 117 / 123 |
| Solape medio / máximo entre enlazadas | 10,14 / 41 | 92,32 / 258 | 5,11 / 21 |
| Exacto conectado (hab) | 4.467 (85,35 %) | 26.254 (92,65 %) | 12.063 (39,01 %) |
| Razón goloso/exacto | 1,000 | 1,000 | 1,000 |

### Lectura del criterio

1. **El filtro de proximidad es indispensable** (lección de la primera corrida
   sin él): con radios de 30 km el puntaje por distancia empata para casi
   todos los puntos de la ventana y el tope se llenaba de puntos casi
   duplicados de un mismo clúster — en Yumbel la primera versión cayó a
   7,83 %. Con `candidate_separation_m` (greedy por puntaje con descarte de
   vecinos más cercanos que la separación) la selección queda espaciada y los
   tres pilotos superan a la retícula: Biobío 85,35 % (+4,91), Metropolitana
   92,65 % (+4,01), Yumbel 39,01 % (+10,07, con separación de 4 km ≈
   √(área/n), el mismo esfuerzo de muestreo de la retícula de 10 km original).
2. **Δ sube respecto de la grilla** (Δ̄ 10–25 vs 6,5–8,2): la generación
   concentra candidatos cerca de la demanda y el corte de 30 km los enlaza.
   Sigue acotado (Δ máx 35–38) y ESU reduce el espacio 45–61 %; las
   evaluaciones (415k / 360k / 27k) caben en los presupuestos configurados.
3. **El mayorante de [3] se vuelve muy flojo** (2,95·10⁹ vs 415k reales):
   sobreestima en grafos densos; el conteo real sigue siendo el insumo fiable
   del informe.
4. **La poda de prefijos sigue en 0 %**: los pesos totales por candidato ≈ la
   población de la ventana; la economía del motor sigue viniendo de ESU.
5. **El solape entre enlazadas crece** (5–92 localidades compartidas de
   media): el objetivo-unión es aún más indispensable que con la grilla;
   optimizar por suma por antena sobredimensionaría el cobertura.

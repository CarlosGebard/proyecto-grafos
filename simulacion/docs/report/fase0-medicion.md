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

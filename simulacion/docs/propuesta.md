# Relación entre la propuesta y la simulación exacta

La simulación mantiene el problema planteado en la propuesta: seleccionar hasta `k` ubicaciones para maximizar población única cubierta. La geografía construye un grafo de cobertura y otro de conectividad LOS entre antenas. La decisión se resuelve mediante enumeración exacta libre y conectada.

## Trazabilidad

| Elemento de la propuesta | Implementación V1 | Evidencia |
| --- | --- | --- |
| Grafo bipartito | `src/graph/models.py`, `src/graph/builder.py` | Conjuntos separados de candidatos y localidades; aristas en `graph.json`. |
| Construcción del grafo | `src/geo/elevation.py`, `line_of_sight.py`, `coverage.py` | Distancia UTM y perfiles del DEM; pruebas de relieve, alturas y NoData. |
| Cobertura máxima ponderada | `CoverageGraph.weight`, `Solution.covered` | Unión de identificadores; una localidad se cuenta una vez. |
| Conectividad entre antenas | `src/geo/coverage.py` | Grafo no dirigido en `connectivity.json`; distancia y LOS entre candidatos. |
| Solución exacta | `src/algorithms/exact.py` | Enumeración libre y conectada, con pruebas independientes. |
| Evaluación | `src/evaluation/metrics.py`, `src/pipeline.py` | Población, porcentaje, tiempo, selección óptima y capas geográficas. |

## Formulación

Sea `A` el conjunto de candidatos, `D` el conjunto de localidades y `w_j >= 0` la población de la localidad `j`. Si `C(a)` contiene las localidades que el candidato `a` cubre, se busca:

```text
maximizar f(S) = suma de w_j para cada localidad en la unión de C(a), con a en S
sujeto a S contenido en A y |S| <= k
```

El algoritmo exacto libre evalúa las combinaciones de `min(k, |A|)` candidatos. Como los pesos son no negativos, una solución de menor tamaño puede ampliarse sin disminuir la cobertura. La variante conectada evalúa todos los tamaños de uno a `k` y descarta los subconjuntos que no forman un único componente en el grafo de enlaces. Si el número de combinaciones supera el límite configurado, la ejecución se detiene y se debe reducir el área o el conjunto de candidatos.

## Supuestos de la simulación

1. Los candidatos se generan como una grilla regular y no representan torres existentes ni disponibilidad legal del suelo.
2. Cada localidad conserva su geometría completa, pero un punto interior representa su cobertura.
3. La población desconocida se excluye y los pesos cero se mantienen.
4. Existe cobertura cuando la distancia es admisible y la línea de vista sobre el DEM no presenta obstrucciones.
5. Existe un enlace entre antenas bajo la misma distancia máxima y LOS, usando altura de antena en ambos extremos.
6. No se modelan curvatura terrestre, Fresnel, difracción, vegetación, pérdidas radioeléctricas, capacidad ni gateway.

## Resultados de las instancias exactas

| Indicador | Biobío | Metropolitana |
| --- | ---: | ---: |
| Localidades con población conocida | 82 | 310 |
| Población total evaluada | 5.234 | 28.337 |
| Candidatos / aristas | 20 / 224 | 19 / 1.639 |
| `k` | 5 | 5 |
| Población cubierta por solución exacta | 4.210 | 25.119 |
| Cobertura exacta | 80,44% | 88,64% |
| Combinaciones evaluadas | 15.504 | 11.628 |

Estos valores describen las instancias piloto y el modelo utilizado, no una conclusión general sobre Chile. Los resultados reproducibles se guardan en `outputs/biobio-exacto/` y `outputs/metropolitana-exacto/`.

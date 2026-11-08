# ADR 0014: Población afectada vs no afectada en tres estados (complementa ADR 0009)

## Contexto

Pendiente de `NOTA-ESTADO.md`: la representación de la población afectada
por la solución era débil. El motor entrega `Solution.covered` (ids de la
unión ∪ C(a), a ∈ S), pero:

- `metrics.json` sólo informaba la población cubierta; la población fuera
  de la solución, y la causa por la que quedaba fuera, no se reportaban;
- el mapa PNG marcaba las cubiertas con un borde verde y no daba a las no
  cubiertas ninguna marca propia; además dibujaba la solución exacta **sin**
  conectividad, mientras el visor mostraba la conectada;
- el visor 3D sólo aclaraba el borde de las cubiertas; las esferas eran
  neutras.

La coropleta de densidad (ADR 0009) ya usa el tono del relleno: el estado
de cobertura no puede usar ese mismo canal sin romperla.

## Decisión

- Cada localidad queda en **uno de tres estados** frente a la solución:
  - **cubierta**: `d ∈ ∪_{a∈S} C(a)`;
  - **alcanzable, no cubierta**: alguna candidata la cubre, pero ninguna
    de S (costo de `k`, de la conectividad o del gateway);
  - **sin alcance**: ninguna candidata la cubre (límite de distancia, LOS,
    NoData o generación de candidatos; no del algoritmo).

  Separar las dos últimas distingue el costo de las restricciones del
  problema del límite geográfico de la instancia.
- Una sola regla: `coverage_status` en `src/evaluation/metrics.py`,
  replicada en `coverageStatus` (`web-conectividad/terrain-view.js`).
  `metrics.json` agrega `population_uncovered_reachable`,
  `population_unreachable` y `localities_by_status`; `demand.geojson` y
  `demand_points.geojson` agregan la propiedad `status`.
- **El estado nunca usa el tono** (la densidad, ADR 0009, no cambia):
  - PNG: borde verde lleno (cubierta), borde naranjo discontinuo
    (alcanzable), trama `////` gris (sin alcance); punto interior lleno sólo
    si está cubierta; recuadro con habitantes, % y localidades por estado;
  - visor 3D: en el paso solución las no cubiertas atenúan el relleno
    (opacidad 0,9 → 0,3, mismo color de clase) y las esferas toman el color
    del estado; la leyenda agrega una barra apilada en proporción a
    habitantes;
  - visor 2D: clase `unreachable` (círculo hueco discontinuo) junto a las
    existentes `covered`/`reachable`; el panel agrega «Sin cubrir» con su
    desglose.
- El mapa PNG pasa a la **solución conectada** (`connected_solution`), la
  misma del visor y la que defiende el informe.

## Consecuencias

- `DENSITY_STOPS` y `populationColor` no cambian; la regla de ADR 0009
  (cambiar una exige cambiar la otra) sigue vigente.
- Los colores de estado del PNG y del visor 3D son los mismos para
  «cubierta» (`#168354`). El 2D didáctico conserva su lenguaje (acento
  para cubierta), porque allí no hay coropleta con la que se confunda.
- Metropolitana (re-corrida del 8 de noviembre de 2026): 26.254 hab
  cubiertos (92,65 %, idéntico), 30 alcanzables no cubiertos, 2.053 sin
  alcance (17 localidades). Casi todo lo no cubierto es límite geográfico,
  no costo de `k` ni de la conectividad.
- Fuera de alcance: el refinamiento dasimétrico de la densidad (ADR 0009)
  sigue pendiente.

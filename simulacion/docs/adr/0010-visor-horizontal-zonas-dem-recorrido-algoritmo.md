# ADR 0010: Visor horizontal, zonas sobre la grilla del DEM y recorrido del algoritmo

## Contexto

Tras ADR 0008 (relieve 3D con three.js vendido) y ADR 0009 (coropletas de
densidad a ras de superficie), la presentación del visor quedó encima de la
mesa: la columna narrativa a la izquierda desperdiciaba ancho de pantalla,
la leyenda mostraba un gradiente y swatches sin valores, las coropletas
flotaban sobre el relieve (el relleno se muestreaba sólo en los vértices de
los anillos) y se superponían en bordes compartidos (mismo `lift`, sin
asignación exclusiva de superficie). Las antenas candidatas no elegidas
seguían visibles en el paso de solución, la malla venía de `terrain.json` a
160 lados por cara y no existía una visualización de cómo se aplicó el
algoritmo sobre los datos reales.

## Decisión

- **Mapa a todo el ancho (revisa ADR 0009 en su layout)**: la columna
  narrativa se elimina; el recorrido de pasos (título, readout y controles)
  vive en un overlay flotante sobre el lienzo. La sección "Cómo leer los
  pasos" se retira.
- **Zonas adaptadas al relieve y sin superposición**: cada localidad se
  pinta como subconjunto de la propia grilla del DEM (`gridOwnership`:
  cada celda pertenece a lo sumo a una localidad; el centro de celda decide,
  primer polígono que la contiene gana). El relleno comparte los vértices
  exactos de la malla (+`ZONE_LIFT` para evitar z-fighting), así las zonas
  siguen el relieve vértice a vértice y dos zonas jamás se solapan. Bordes,
  caminos OSM y enlaces LOS se densifican a la celda del DEM para no cortar
  cerros.
- **Granularidad**: `terrain_payload` sube `max_side` de 160 a 320
  (`TERRAIN_MAX_SIDE`); escala vertical real sin exageración (invariante de
  ADR 0008). La grilla compacta en `terrain.json` (~0,5 MB por piloto) se
  escribe con separadores compactos; las filas se redondean a 0,1 m. La
  construcción de la escena se cachea por (terrain, escenario): sólo se
  reconstruye al cambiar de piloto, no en cada paso.
- **Tintes hipsométricos transversales**: se mantiene la única fuente de
  tinta (rampa de `palettes.py` recortada al rango real, exportada en
  `terrain.json.palette`) y la leyenda ahora la rotula: ticks con los cortes
  reales de elevación y rangos hab/km² por clase de densidad (cuantiles).
- **Candidatas fuera en la solución**: al llegar al paso final sólo
  permanecen las antenas elegidas; las candidatas descartadas se remueven de
  la escena 3D y del SVG didáctico con la misma regla.
- **Zoom con botones**: `+`/`−` sobre el lienzo mueven la cámara sobre la
  línea de vista respetando los topes de OrbitControls (la rueda sigue
  funcionando).
- **Recorrido del algoritmo**: debajo de la simulación, la sección "Cómo se
  aplicó el algoritmo" muestra cuatro fases (candidatos del criterio,
  cobertura distancia+LOS, selección exacta del motor, red conectada) con
  los números reales del escenario cargado (`metrics.json`: evaluaciones,
  tiempo, población; contraste con el baseline goloso). Cada tarjeta
  sincroniza el mapa con su fase.

## Consecuencias

- Costo de carga inicial por piloto ~10–16 s (fetch + parse de
  `demand.geojson`/`terrain.json` + construcción única), luego instantáneo
  por caché; aceptable para un visor didáctico offline.
- Las zonas heredan la resolución del DEM: celdas pequeñas en detalles
  agudos; sin superposiciones por construcción.
- El recorrido paso a paso del visor y las fases del algoritmo comparten
  estado (`state.step`): una sola fuente de verdad narrativa.
- `terrain.json` sigue siendo artefacto de comunicación (ADR 0003): nunca
  recalcula LOS.

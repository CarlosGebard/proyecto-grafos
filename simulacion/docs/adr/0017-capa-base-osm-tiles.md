# ADR 0017: Capa base OpenStreetMap en el mapa de Chile y el visor 3D

Fecha: 18 de noviembre de 2026.
Revisa: ADR 0008 («sin red») y ADR 0016 (mapa propio equirectangular) en lo
que respecta al fondo del mapa. No cambia el motor ni el pipeline: es una
decisión exclusivamente de presentación.

## Contexto

El usuario pidió usar el estilo de mapa de OpenStreetMap como capa base
para el mapa completo de Chile y para las zonas de simulación. Hasta ahora:

- El mapa de Chile dibujaba un tinte plano (`#16283a`) con el contorno
  Natural Earth vendido; sin referencias geográficas (costa, lagos, caminos,
  ciudades vecinas).
- El visor 3D tintaba el relieve con la paleta hipsométrica del pipeline
  (misma tinta que el PNG), sin toponimia ni caminos.

El estilo tiles de OpenStreetMap da ese contexto geográfico de una sola
pieza, sin incorporar una librería de mapas (se descarta Leaflet/MapLibre:
ADR 0008 sigue siendo «sin build»; los tiles se ensamblan a mano).

## Decisión

- **Tiles raster estándar de OSM** (`tile.openstreetmap.org/{z}/{x}/{y}.png`),
  descargados en runtime y ensamblados en un único canvas por
  `web-conectividad/osm-tiles.js` (Web Mercator aritmético, sin librerías;
  descargas en paralelo acotado a 6, zoom moderado, atribución visible).

- **Mapa de Chile**: la proyección pasa de equirectangular 36° S a
  **Web Mercator** en el mismo espacio de píxeles del tile z=7
  (`WORLD = 256·2⁷`), de modo que la imagen de tiles y el SVG comparten
  coordenadas. Los tiles nacionales (z=7, ~160 teselas) van como `<image>`
  bajo el contorno Natural Earth, que queda como borde y **respaldo sin
  red**: si la mitad de las teselas falla, `assembleTiles` devuelve `null`
  y el mapa vuelve al tinte plano (`#chile-map.tiles-ok` conmuta el CSS).
  Los puntos de localidad, marcadores y animación de `viewBox` no cambian;
  sólo cambia `project()`. Al abrir la carta de una zona se **precarga**
  una capa de detalle z=10 (cacheada por zona) para que el vuelo hacia la
  zona termine nítido.

- **Visor 3D**: la malla del terreno gana un atributo `uv` (esquina SO →
  NE de `bounds_wgs84`). Al construir la escena se ensamblan los tiles de
  la ventana a z≈12 (~2.200 px de ancho, máx. z13) y se aplican como
  `map` de `MeshLambertMaterial`, conmutando `vertexColors` a falso. El
  color base del material baja a 0,45 para compensar la luz (ambiente 1,0 +
  sol 2,2 saturaba los tiles pálidos); el sombreado del relieve se conserva.
  Si no hay red, la paleta hipsométrica por vértice queda como está: el
  visor sigue funcionando offline (ADR 0008 en su parte vendida).

- **Atribución**: «© OpenStreetMap contributors» visible en la barra del
  mapa de Chile y sobre el visor 3D, y en el pie del inicio. Requisito de
  la licencia ODbL/CC-BY-SA de OSM.

## Consecuencias

- El visor **usa red** para el fondo (primera vez que ADR 0008 cede): el
  resto sigue vendido y sin build. La degradación sin red es elegante en
  ambas superficies (tinte plano / paleta hipsométrica).
- La política de uso de tiles de OSM exige moderación: descargas acotadas
  (≤200 teselas por capa), zooms ≤13, capas cacheadas por zona. No se usa
  para nada computacional: el motor nunca lee estos tiles.
- La capa de caminos OSM del visor 3D (ADR 0004, trazados vectoriales del
  pipeline) se mantiene: los tiles son fondo, no reemplazan los artefactos
  de comunicación. Los overlays (coropletas, rangos ρ(a), restricciones,
  torres, enlaces) siguen encima de la textura.
- El PNG del pipeline no cambia: sus tintas hipsométricas siguen siendo la
  referencia impresa; el visor web simplemente comparte menos tinta con él
  cuando hay red.

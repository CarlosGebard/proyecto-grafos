# ADR 0018: restricción de agua — sin antenas sobre cuerpos de agua

## Contexto

Las antenas candidatas podían caer sobre lagos, lagunas y riberas. En la
corrida versionada de Metropolitana, **5 de las 40 candidatas** (una ancla de
localidad y cuatro sitios altos) están dentro de la Laguna de Aculeo, y la
solución exacta elegía antenas sobre el agua — visible en la simulación web
del 19 de noviembre de 2026. Ningún filtro existente la detecta:

- Pendiente (constructibilidad): una lámina de agua es plana; pasa el filtro.
- NoData del DEM: sobre la laguna hay elevación válida; pasa el filtro.
- PRC (ADR 0005): excluye zonas «agua» sólo donde hay PRC declarado
  (Yumbel); Metropolitana y Biobío no declaran PRC, y la cobertura comunal no
  alcanza toda la hidrografía (ríos y riberas fuera de los polígonos
  comunales).
- El criterio de candidatos (ADR 0007) genera anclas, intersecciones
  Murray–Tong y sitios altos sin conocer el uso del suelo.

Sobre un cuerpo de agua no se instala una torre: es una restricción física de
emplazamiento, del mismo tipo que la pendiente, no una zona normativa.

## Decisión

1. **Restricción territorial dura por defecto** (`exclude_water = true` en
   `PipelineConfig`): todo candidato cuyo punto cae dentro de un polígono
   `natural = water` de OSM queda excluido del modelo
   (`constraint_rule = "water_body"`), con la misma mecánica de
   `apply_*_constraints` que PRC y establecimientos sensibles. La localidad
   ancla sigue siendo punto de demanda; sólo deja de ser sitio de antena.
2. **Fuente de datos**: Overpass (`water_geojson`: ways cerrados + relaciones
   reensambladas como multipolígonos con `polygonize`, huecos incluidos), o
   una **instantánea local** con `--water-file` para corridas reproducibles
   sin red (la capa `water_a` del extracto Geofabrik de Chile es una
   alternativa equivalente: 764 MB, filtrada por bbox al cargar). El archivo
   efectivo se exporta como `water.geojson` en la salida: evidencia y
   snapshot reutilizable.
3. **Trazabilidad**: los excluidos por agua se agregan a
   `candidate_rejections.geojson` (reason `agua`) y a
   `excluded_candidates.geojson`; el audit vive en
   `manifest.json → water_constraints` (fuente, atribución OSM, conteo de
   polígonos y de excluidos); la carta de restricciones (ADR 0015) gana la
   fila «Sin antenas sobre agua» con la cadena
   `C₂ = { p ∈ C₁ : p ∉ W }`.
4. **El motor no cambia**: la enumeración exhaustiva de pares con LOS sigue
   intocada; el filtro actúa en la generación de la instancia, antes del
   grafo. La optimalidad exacta es sobre la instancia ya filtrada.
5. **Desactivable explícitamente** con `--no-exclude-water` / TOML
   `exclude_water = false`: la configuración queda registrada en el
   manifiesto, y la ausencia del filtro es auditable, nunca silenciosa.

## Consecuencias

- Re-corridas de los tres pilotos (19 de noviembre de 2026): Metropolitana excluye 5 candidatas sobre la Laguna de Aculeo y pasa de 26.254 hab (92,65 %) a **26.136 hab (92,23 %)**; Biobío y Yumbel no excluyen ninguna (sus ventanas no tienen candidatos en agua: el PRC de Yumbel ya cubría la hidrografía comunal) y quedan idénticas (3.752 hab / 71,69 % y 9.399 hab / 30,39 %). La solución exacta ya no elige antenas sobre el agua; los detalles por corrida quedan en sus `metrics.json` y `manifest.json → water_constraints`.
- La Laguna de Aculeo está mapeada en OSM (relación 17863675) pese a su
  desecación documentada (2018–2022): el polígono vigente representa la
  lámina histórica. Para el screening de emplazamiento es el lado
  conservador; se declara como limitación de datos, no como certificación
  hidrográfica.
- Overpass responde lento para ventanas grandes (minutos en la primera
  consulta de relaciones): para corridas repetibles se recomienda la
  instantánea `--water-file`; los tres pilotos versionados se corrieron así.
- Biobío y Yumbel reutilizaron el corte DEM versionado (`--dem
  outputs/<piloto>/dem.tif`) porque el RAR ALOS sigue sin copia local: con
  `dem_label` el manifiesto declara la procedencia real del raster
  («Copernicus GLO-30 public 2021, corte versionado reutilizado»), en vez de
  la etiqueta genérica `user_provided`.
- Config: `exclude_water` (verdadero por defecto), `water_file`, `dem_label`;
  CLI `--no-exclude-water`, `--water-file`, `--dem-label`.

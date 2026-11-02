# Ejecutar el pipeline geoespacial V1

## Preparación

Desde la raíz, ejecutar `uv sync --locked`. Python 3.12 o posterior. Se usa `7z` sólo para extraer los RAR ya presentes; también se aceptan fuentes extraídas, sin ese ejecutable. `uv.lock` fija las versiones probadas.

Los originales se preservan. Los archivos preparados se guardan en `data/prepared/`. Si no existe `data/SHP.rar`, `--download-population` permite descargarlo de SUBDERE. Sin ese flag, un archivo ausente produce un error claro. Las descargas se escriben primero en `.part` y se renombran al terminar; los archivos ya completos se reutilizan.

## Fuentes

- [SUBDERE, estudio 2021 basado en Censo 2017](https://proactiva.subdere.gov.cl/handle/123456789/523): SHP, GDB, diccionario y metadatos. El SHP local contiene 29.256 polígonos, CRS EPSG:5360, identificador `ID` y población `HABITANTES`. El diccionario en `SHP.rar` define `-99` como población no computada. No se filtra por condición de aislamiento: se usan todas las localidades con población conocida en la ventana.
- ALOS PALSAR / CIREN-IDE Chile: el archivo local `DEM Alos Palsar Región del Biobío.rar` contiene `Biobio/REGION_BIOBIO.jp2`, EPSG:32718, píxel 12,5 m y NoData 0. Se recorta y convierte a GeoTIFF; no se carga el raster regional completo en memoria. Se conserva la etiqueta del proveedor; el espaciamiento de píxel no garantiza una precisión vertical equivalente.
- [Ficha ALOS Metropolitana](https://geoportal.cl/geoportal/catalog/35439/DEM%20Alos%20Palsar%20Regi%C3%B3n%20Metropolitana): si se obtiene ese recurso, extraer el raster y proporcionarlo con `--dem`. Esta V1 automatiza el ALOS local, no las descargas regionales del Geoportal.
- [Copernicus GLO-30 público en AWS](https://registry.opendata.aws/copernicus-dem/): alternativa automatizada explícita, tiles GeoTIFF de la distribución 2021. Es un modelo de superficie (puede incluir infraestructura y vegetación). Consultar las condiciones y atribución enlazadas por el proveedor al redistribuir datos derivados. La primera descarga necesita red; luego se reutiliza `data/downloads/copernicus/`.
- SRTM se puede suministrar como raster local con `--dem`; no se necesita para el piloto disponible.

## Comandos

Piloto con datos locales, sin red después de instalar dependencias:

```bash
uv run python -m src.pipeline --config configs/biobio.toml --output outputs/biobio-nuevo
```

Metropolitana con Copernicus:

```bash
uv run python -m src.pipeline --region metropolitana --dem-source copernicus --k 5 --candidate-spacing 5000 --max-distance 30000 --output outputs/rm-nuevo
```

Bbox arbitrario en orden oeste, sur, este, norte; coordenadas WGS84:

```bash
uv run python -m src.pipeline --bbox -72.65 -37.30 -72.45 -37.10 --k 3 --output outputs/bbox-nuevo
```

Área poligonal y fuentes propias (rutas de ejemplo que deben existir):

```bash
uv run python -m src.pipeline --polygon mi-area.geojson --population localidades.gdb --layer LCA_2021 --id-field ID --population-field HABITANTES --dem mi-dem.tif --output outputs/poligono-nuevo
```

El archivo de área debe declarar CRS y contener polígonos válidos. Se estima UTM local; grilla, distancias y perfiles usan metros. `--bbox` y `--polygon` son excluyentes. Los presets regionales son ventanas experimentales de unos 20 km por lado. Para procesar límites administrativos propios, pasarlos por `--polygon` y respetar los límites de recursos.

## Configuración

La CLI prevalece sobre los valores TOML. Rutas relativas a la raíz desde la que se ejecuta el comando. Consultar `uv run python -m src.pipeline --help`.

| TOML | CLI | Valor predeterminado |
| --- | --- | ---: |
| `candidate_spacing_m` | `--candidate-spacing` | 5000 |
| `max_distance_m` | `--max-distance` | 30000 |
| `antenna_height_m` | `--antenna-height` | 30 |
| `receiver_height_m` | `--receiver-height` | 1.5 |
| `sample_step_m` | `--sample-step` | medio píxel DEM |
| `dem_resolution_m` | `--dem-resolution` | resolución local si coincide el CRS; 30 m al reproyectar otro CRS |
| `max_combinations` | `--max-combinations` | 100000 |
| `max_candidates` | `--max-candidates` | 10000 |
| `max_pairs` | `--max-pairs` | 2000000 |
| `max_dem_pixels` | `--max-dem-pixels` | 10000000 |

El paso LOS no puede exceder medio píxel DEM. Alterar la resolución modifica el modelo y puede cambiar aristas. El límite de grilla se aplica antes de filtrar por polígono/NoData. La solución exacta es obligatoria: si excede el límite de combinaciones, la ejecución termina con error y solicita reducir el área o el conjunto de candidatos. Las descargas Copernicus están limitadas a cuatro tiles por estudio.

## Resultados

| Archivo | Contenido |
| --- | --- |
| `graph.json` | Cobertura por candidato y población por localidad; IDs como texto |
| `metrics.json` | Resultados por algoritmo, k, tamaños, población total/cubierta, porcentaje, tiempo de algoritmo, seleccionadas y cubiertas; estado del exacto y brecha cuando existe |
| `manifest.json` | Parámetros efectivos, bbox, CRS, resolución, versiones, hashes SHA-256 de insumos, exclusiones y tiempos por fase |
| `dem.tif` | Recorte reproyectado, float32, NoData NaN |
| `demand.geojson` | Geometrías originales completas, peso y cobertura exacta |
| `demand_points.geojson` | Puntos interiores usados en LOS |
| `candidates.geojson` | Todos los candidatos válidos, elevación y selección exacta |
| `study_area.geojson` | Área efectiva en WGS84 |
| `map.png` | Intensidad poblacional, cobertura y antenas de la solución exacta |

Porcentaje = población única cubierta / población conocida de las localidades incluidas × 100. La población desconocida se excluye y queda auditada; la demanda con terreno desconocido permanece en el total como no cubierta. La brecha es fracción, no puntos porcentuales. El tiempo de algoritmo no incluye GIS; los tiempos completos están en el manifiesto.

El mapa representa cobertura en puntos interiores, no cobertura uniforme comprobada en cada polígono. Para revisar la solución exacta, usar sus IDs de `metrics.json` con `candidates.geojson` y `demand.geojson`.

## Validación y recuperación

```bash
uv run pytest -q
uv run ruff check .
uv run ruff format --check .
```

Los tests usan datos controlados en directorios temporales; nunca sustituyen las fuentes reales del piloto. Cubren pesos únicos, comparación exacta con un oráculo independiente, límites, grilla, CRS, lomas, alturas, NoData, recorte, carga poblacional y exportación end-to-end.

Para repetir una ejecución, elegir un `--output` nuevo: no se sobrescriben resultados existentes. Una ejecución fallida puede dejar un DEM o archivos parciales en la salida; sólo se considera completa si termina con código 0 y existe `manifest.json`. Revisar el error y repetir en otra salida. Los errores de descarga requieren restablecer conectividad o suministrar archivos locales. Si una fuente cacheada está corrupta, moverla a una copia de respaldo antes de descargar de nuevo.

No hay servicios, base de datos ni infraestructura a desplegar.

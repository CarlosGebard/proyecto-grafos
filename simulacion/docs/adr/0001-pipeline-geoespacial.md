# ADR 0001: pipeline experimental basado en la propuesta

Estado: aceptada para V1. Fecha: 2026-09-07.

## Contexto

La propuesta PDF define un grafo bipartito y Maximum Coverage ponderado. El repositorio sólo tenía documentos y datos reales SUBDERE/ALOS, sin código que reutilizar. Se necesita separar la construcción geográfica del problema combinatorio y probar una instancia pequeña.

## Decisión

Usar un paquete `src` ejecutable como módulo, con responsabilidades `data`, `geo`, `graph`, `algorithms`, `evaluation` y `visualization`. Configuración mediante dataclass y TOML de la biblioteca estándar, con opciones CLI. GeoPandas/Shapely/PyProj manejan vectores y CRS; Rasterio lee y reproyecta ventanas DEM; NumPy muestrea perfiles; Matplotlib exporta el mapa. Las dependencias transitivas GIS se resuelven mediante ruedas binarias y `uv.lock`; no se requiere instalar GDAL como aplicación ni NetworkX.

Representar cobertura con `dict[str, set[str]]` y población con `dict[str, float]`. Conservar nodos y geometrías para visualización, pero ejecutar la enumeración exacta solamente contra el grafo. LOS es una función aislada e inyectable. Los originales no se modifican; resultados y preparación van a directorios separados.

## Consecuencias

Se puede reemplazar el modelo de cobertura sin modificar la función objetivo ni los algoritmos. La primera ejecución usa Biobío porque el DEM ALOS ya está disponible. Metropolitana tiene un preset pequeño con Copernicus explícito. Se pueden suministrar archivos ALOS o SRTM locales por `--dem`; no se añade una plataforma de descarga GIS ni un fallback silencioso entre fuentes científicamente distintas.

Para proteger el alcance experimental se limitan píxeles DEM, puntos de grilla, pares candidatos-demanda y combinaciones exactas. La discretización por localidad y el muestreo LOS introducen aproximaciones documentadas en [la trazabilidad científica](../propuesta.md).

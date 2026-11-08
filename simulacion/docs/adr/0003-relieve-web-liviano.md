# ADR 0003: Relieve reducido para el visor web

## Contexto

El DEM del piloto permite calcular LOS, pero un GeoTIFF de análisis no es un formato directo para el navegador. Mostrar todas las aristas 2D simultáneamente dificulta explicar la relación entre terreno y visibilidad.

## Decisión

El pipeline exportará `terrain.json`: una grilla reducida de elevaciones, límites WGS84 y métricos, dimensiones y rango vertical. El visor la renderizará con Canvas 2D y proyección de perspectiva, sin dependencias de frontend.

## Consecuencias

- El visor puede mostrar relieve real sin descargar ni interpretar el GeoTIFF completo.
- La grilla se simplifica para interacción fluida y no se usa para recalcular LOS.
- El GeoTIFF conserva el rol científico; `terrain.json` es sólo un artefacto de comunicación.

Actualización (2026-11-07): el relieve 3D de los pilotos pasa a three.js
vendido y sin painter's algorithm (ADR 0008). Se mantiene: `terrain.json` como
artefacto de comunicación, visor estático funcional offline y sin build; el
ejemplo didáctico conserva Canvas 2D.

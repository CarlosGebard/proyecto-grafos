# Estado del proyecto

Última verificación: 2 de noviembre de 2026.

## Completado

- Primera entrega: propuesta en [PDF](propuesta-primera-entrega/entregables/propuesta-inicial.pdf), con informe y anexos en `propuesta-primera-entrega/`.
- Simulación V1: pipeline geoespacial, pruebas automatizadas, documentación técnica y visor local del piloto Biobío.
- Solución: optimización exacta de cobertura máxima ponderada, usando distancia y línea de vista sobre un DEM.

## Pilotos disponibles

| Piloto | Resultado exacto |
| --- | --- |
| Biobío | 5 ubicaciones cubren 4.210 de 5.234 habitantes (80,44 %). |
| Metropolitana | 5 ubicaciones cubren 25.119 de 28.337 habitantes (88,64 %). |

Los archivos que respaldan estas cifras están en `simulacion/outputs/biobio-exacto/` y `simulacion/outputs/metropolitana-exacto/`.

## Pendiente y límites

- Los presets regionales son ventanas piloto, no regiones administrativas completas.
- El modelo representa cada localidad mediante un punto interior; no certifica cobertura radioeléctrica ni la factibilidad de instalación.
- La versión actual no incorpora Censo 2024 ni el filtro PRC. Ver [documento explicativo](simulacion/docs/documento-explicativo.md).

## Para continuar

1. Ejecutar el piloto Biobío siguiendo el [README principal](README.md).
2. Consultar parámetros, datos y salidas en el [runbook](simulacion/docs/runbooks/pipeline.md).
3. Usar un directorio nuevo dentro de `simulacion/outputs/` para cada simulación.

# Estado del proyecto

Última verificación: 6 de noviembre de 2026.

## Completado

- Primera entrega: propuesta en [PDF](propuesta-primera-entrega/entregables/propuesta-inicial.pdf), con informe y anexos en `propuesta-primera-entrega/`.
- Simulación V1: pipeline geoespacial, pruebas automatizadas, documentación técnica y visor local del piloto Biobío.
- Solución: optimización exacta de cobertura máxima ponderada, usando distancia y línea de vista sobre un DEM.
- Motor exacto conectado (rama `feat/algoritmo`): enumeración ESU de subconjuntos conexos ([spec](docs/algoritmo-conectado.md)), objetivo incremental como unión, cota de prefijos con desempate lexicográfico, gateway opcional, clases de potencia con radio efectivo, umbral `t` y baseline goloso. Fuerza bruta eliminada; ver [ADR 0006](simulacion/docs/adr/0006-motor-esu-gateway-potencia-umbral.md).

## Pilotos disponibles

| Piloto | Resultado exacto (reproducido tras el cutover) |
| --- | --- |
| Biobío | 5 ubicaciones cubren 4.210 de 5.234 habitantes (80,44 %); conectado 9.922 evaluaciones vs 21.700 combinaciones. |
| Metropolitana | 5 ubicaciones cubren 25.119 de 28.337 habitantes (88,64 %); conectado 4.394 evaluaciones vs 11.672 combinaciones. |

Las corridas de regresión del cutover están en `simulacion/outputs/biobio-regresion-esu/` y `simulacion/outputs/metropolitana-regresion-esu/`; la corrida de validación con clases de potencia, gateway y umbral en `simulacion/outputs/yumbel-clases-2/` y `simulacion/outputs/yumbel-gateways/`.

## Pendiente y límites

- Los presets regionales son ventanas piloto, no regiones administrativas completas.
- El modelo representa cada localidad mediante un punto interior; no certifica cobertura radioeléctrica ni la factibilidad de instalación.
- Informe final (fase 3, lo último) con la tabla greedy-vs-exacto; el insumo de fase 0 está medido en `simulacion/docs/report/fase0-medicion.md`.
- El modelo aún no incorpora Censo 2024. Ver [documento explicativo](simulacion/docs/documento-explicativo.md).

## Para continuar

1. Ejecutar el piloto Biobío siguiendo el [README principal](README.md).
2. Consultar parámetros, datos y salidas en el [runbook](simulacion/docs/runbooks/pipeline.md).
3. Usar un directorio nuevo dentro de `simulacion/outputs/` para cada simulación.

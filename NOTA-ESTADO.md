# Estado breve

## Fase actual

Motor exacto conectado implementado en `feat/algoritmo` (cutover de la fuerza bruta). Pilotos revalidados.

## Resuelto

- Grafo: candidatos ↔ localidades.
- Arista: distancia válida + LOS sobre relieve.
- Conectividad/LOS entre antenas: grafo `G_conn` ya construido por `src/geo/coverage.py:compute_connectivity` (enlace usa `min(ρu, ρv)` con radios por clase de potencia).
- Objetivo: hasta `k` antenas, máxima población única cubierta (unión incremental, no suma por antena).
- Solución exacta: enumeración ESU de subconjuntos conexos (`src/algorithms/connected.py`), con cota, desempate lexicográfico, gateway opcional y umbral `t`; baseline goloso para contraste.
- Pilotos: Biobío 80,44 %; Metropolitana 88,64 % (`k=5`), idénticos tras el cutover.

## Pendiente

- Informe final (fase 3); medición de fase 0 lista en `simulacion/docs/report/fase0-medicion.md`.
- Censo 2024.
- Modelo radioeléctrico, permisos, costos y factibilidad real.

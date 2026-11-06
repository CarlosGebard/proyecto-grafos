# Estado breve

## Fase actual

Motor exacto conectado implementado en `feat/algoritmo` (cutover de la fuerza bruta). Pilotos revalidados.

## Resuelto

- Grafo: candidatos ↔ localidades.
- Arista: distancia válida + LOS sobre relieve.
- Conectividad/LOS entre antenas: grafo `G_conn` ya construido por `src/geo/coverage.py:compute_connectivity` (enlace usa `min(ρu, ρv)` con radios por clase de potencia).
- Objetivo: hasta `k` antenas, máxima población única cubierta (unión incremental, no suma por antena).
- Solución exacta: enumeración ESU de subconjuntos conexos (`src/algorithms/connected.py`), con cota, desempate lexicográfico, gateway opcional y umbral `t`; baseline goloso para contraste.
- Candidatos por criterio (ADR 0007): anclas en localidades + intersecciones Murray–Tong + sitios altos del DEM; filtros de pendiente, proximidad y establecimientos sensibles (OGUC 116 bis E / Ley 20.599). La retícula regular quedó eliminada.
- Pilotos con criterio (ADR 0007, `k=5`); los tres superan a la retícula: Biobío 85,35 % (4.467/5.234, +4,91 p.p.), Metropolitana 92,65 % (26.254/28.337, +4,01 p.p.), Yumbel con clases 39,01 % conectado (12.063/30.923, +10,07 p.p.; separación de 4 km ≈ √(área/n)).

## Pendiente

- Informe final (fase 3). Fase 0 re-medida sobre el criterio (`fase0-medicion.md`, sección criterio).
- Censo 2024.
- Modelo radioeléctrico, permisos, costos y factibilidad real.

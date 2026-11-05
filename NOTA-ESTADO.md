# Estado breve

## Fase actual

Simulación V1 terminada. Pilotos acotados, no red real.

## Resuelto

- Grafo: candidatos ↔ localidades.
- Arista: distancia válida + LOS sobre relieve.
- Objetivo: hasta `k` antenas, máxima población única cubierta.
- Solución exacta: fuerza bruta; óptima en instancia piloto.
- Pilotos: Biobío 80,44 %; Metropolitana 88,64 % (`k=5`).

## Pendiente

- Conectividad/LOS entre antenas.
- PRC y Censo 2024.
- Modelo radioeléctrico, permisos, costos y factibilidad real.

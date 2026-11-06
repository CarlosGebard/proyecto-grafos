# ADR 0007: generación de candidatos por criterio territorial

## Contexto

La V1 generaba candidatos en una retícula regular UTM (`candidate_spacing_m`). El muestreo uniforme cuantiza la cobertura por el espaciado, coloca candidatos donde no hay demanda alcanzable y hace que el porcentaje alcanzable dependa de la alineación de la grilla, no sólo del terreno. En cobertura máxima en espacio continuo con demanda puntual y cobertura circular, Murray & Tong (2007, IJGIS 21(7)) muestran que basta considerar como candidatos los puntos de demanda y las intersecciones de circunferencias de radio de cobertura; la retícula es una heurística sin garantía de dominancia. Además, la normativa chilena de emplazamiento (OGUC arts. 116 bis E–H, Ley 20.599) impone restricciones que la grilla ignoraba: establecimientos sensibles (educacionales, salas cuna, hospitales, hogares de ancianos) prohíben instalación en el predio y a menos de 4× la altura de la torre (mínimo 50 m) de sus deslindes. El comentario del profesor fija que lo exhaustivo es sólo el grafo de visibilidad.

## Decisión

1. **Reemplazar la grilla** por generación por criterio (`src/geo/candidates.py`):
   - **Anclas**: un candidato en cada localidad (punto representativo SUBDERE).
   - **Intersecciones Murray–Tong**: puntos a distancia ρ_a de una localidad y ρ_b de otra, para todos los pares de localidades y radios de clase (multiradio, adaptación propia; cf. multitype MCLP, Blanco et al. 2023).
   - **Sitios altos**: máximos locales del DEM en ventanas de `highsite_window_m`, con supresión no-máxima determinista (un sitio por ventana). Favorece LOS rural de acceso y enlace.
2. **Filtros** (en orden, audita cada uno): cobertura del área, NoData del DEM, pendiente ≤ `max_slope_deg` (proxy de constructabilidad desde el gradiente del DEM), **proximidad**: selección greedy por puntaje que descarta todo punto más cercano a uno aceptado que `candidate_separation_m` (sin esto, el tope se llena de duplicados de un mismo clúster porque el puntaje por distancia empata en toda la ventana), y tope final `max_candidates`; orden determinista por (−puntaje, clave métrica).
3. **Establecimientos sensibles** (`sensitive_directory`): con capa declarada se excluye cada establecimiento y su entorno de `max(4× antenna_height_m, 50)` m. Sin capa, la auditoría del manifiesto lo declara como limitación de datos; jamás se interpreta como permiso (ADR 0005).
4. **El motor exacto no cambia**: la optimalidad es sobre la instancia generada; IDs deterministas (`d_`, `x_`, `h_` + coordenada métrica) mantienen el desempate lexicográfico reproducible.

## Consecuencias

- Los números piloto cambian de instancia y **los tres superan a la retícula**: Biobío 4.210 (80,44 %) → **4.467 (85,35 %)**; Metropolitana 25.119 (88,64 %) → **26.254 (92,65 %)**; Yumbel con clases (conectado) 8.950 (28,94 %) → **12.063 (39,01 %)** con `k=5` y el mismo motor. En Yumbel la separación se fijó en 4 km ≈ √(área/n), el mismo esfuerzo de muestreo de la retícula de 10 km original; la primera corrida sin filtro de proximidad colapsó a 7,83 % (clúster de duplicados) — lección registrada en `docs/report/fase0-medicion.md`. La selección óptima de Biobío combina anclas y sitios altos; la de Yumbel son intersecciones espaciadas.
- La equivalencia exacta de Murray–Tong cubre cobertura circular pura: con LOS, conectividad y gateway la generación es una aproximación fundamentada, no una garantía formal. Declararlo en el informe (fase 3).
- El régimen Δ ya no está "acotado por grilla": el corte de distancia sigue acotando el grado, pero la densidad local sube (Δ̄ 10–25 vs 6,5–8,2 de la retícula); `max_candidates`, `candidate_separation_m` y los presupuestos `max_pairs`/`max_evaluations` protegen el peor caso (Biobío: 40 candidatos → 415k evaluaciones exactas, dentro del presupuesto 2M).
- Config: se elimina `candidate_spacing_m`; se agregan `max_slope_deg` (30°), `highsite_window_m` (1.000 m), `candidate_separation_m` (1.000 m; en ventanas amplias escalar como √(área/n) para mantener el esfuerzo de muestreo) y `sensitive_directory`.

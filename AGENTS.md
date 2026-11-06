# AGENTS.md — contexto para asistentes de IA

Archivo de orientación para cualquier IA (o persona) que trabaje en este repositorio. Contiene qué es el proyecto, en qué estado está, qué falta hacer y cómo abordarlo sin romper decisiones ya tomadas.

## 1. Qué es este proyecto

Proyecto universitario (Grafos y Algoritmos, prof. Karol Suchan): **optimización de cobertura territorial mediante grafos**. Herramienta de prefactibilidad para conectividad rural en Chile: dado un área, localidades con población (SUBDERE/Censo) y un DEM real (ALOS/Copernicus), selecciona hasta `k` sitios de antena maximizando la **población única cubierta**, con cobertura definida por distancia + línea de vista (LOS) sobre el relieve. Los Planes Reguladores Comunales (PRC) filtran candidatos como *screening territorial* — nunca como permiso de construcción.

Pilotos ya ejecutados: Biobío 4.210/5.234 hab (80,44 %), Metropolitana 25.119/28.337 hab (88,64 %), `k=5`. Evidencia local en `simulacion/outputs/` (no versionada).

## 2. Estado actual (noviembre 2026)

- **Motor exacto conectado implementado** (cutover completo, `exact.py` eliminado): `simulacion/src/algorithms/connected.py` con ESU + unión incremental + cota de prefijos + desempate lexicográfico, gateway, clases de potencia (`radius_m` por candidato, `min(ρu, ρv)` en enlaces), umbral `t` y baseline goloso. Pilotos reproducidos idénticos: Biobío 4.210 hab (80,44 %), Metropolitana 25.119 hab (88,64 %); ver ADR 0006.
- **Candidatos por criterio (ADR 0007)**: la retícula regular fue reemplazada por anclas en localidades + intersecciones Murray–Tong + sitios altos del DEM, con filtros de pendiente, proximidad y establecimientos sensibles (OGUC 116 bis E / Ley 20.599; sin capa declarada queda como limitación de datos, nunca como permiso). Pilotos re-corridos con `k=5`; los tres superan a la retícula: Biobío 85,35 % (4.467/5.234, +4,91), Metropolitana 92,65 % (26.254/28.337, +4,01), Yumbel con clases 39,01 % conectado (12.063/30.923, +10,07).
- **Rama activa: `feat/algoritmo`**. Push funcionando como colaborador de `CarlosGebard/proyecto-grafos` (antes la clave autenticaba como `not-narleeek`, sin acceso: resuelto el 6 de noviembre de 2026).
- **Informe final (fase 3) hecho**: `informe/informe-final.tex` (+ PDF compilado en `informe/entregables/`) — mapeo a PartialConRBDS, techo teórico documentado (Thm 1/2/4 de [1]), datos concretos de fase 0 y tabla greedy-vs-exacto. Fase 0 re-medida sobre el criterio (`simulacion/docs/report/fase0-medicion.md`, sección criterio).

## 3. Mandato de la rama (estado)

1. **[HECHO]** Reemplazar la fuerza bruta por el motor exacto de la especificación: enumeración canónica de subconjuntos conexos (ESU, Wernicke 2006) + unión incremental del objetivo + cotas + desempate lexicográfico. Sin heurísticas como solución principal.
2. **[HECHO]** Extender el modelo según la retroalimentación del profesor: LOS entre antenas formalizada (`compute_connectivity`, ahora con `min(ρu, ρv)`); gateways (`S ∩ G ≠ ∅`); potencia → radio efectivo por clase (`[[antenna_class]]`, valores en `docs/referencias-potencia-antenas.md`); umbral `t` (`min_population` + `min_antenas_para_objetivo`).
3. **[HECHO]** Baseline goloso (`greedy_conectado`) para el contraste rápido-vs-óptimo.
4. **[HECHO]** Docs/ADRs tras el cutover: ADR 0006 nuevo; ADR 0002 actualizado; `ESTADO.md` y `NOTA-ESTADO.md` sincronizados.
5. **[HECHO]** Fase 0: medición en los pilotos — Δ̄/Δ máx, conexos reales vs combinaciones, tasa de poda, solapes — registrada en `simulacion/docs/report/fase0-medicion.md` (script: `medicion_fase0.py`).
6. **[HECHO]** Fase 3: informe con justificación (paper ITCS + régimen Δ acotado), techo teórico documentado y tabla greedy-vs-exacto, partiendo de la medición de fase 0 — `informe/informe-final.tex` (+ PDF en `informe/entregables/`).

## 4. Fuentes de verdad (orden de lectura)

1. `docs/G8_PPS_GA_KS.pdf` — propuesta con **comentarios del profesor como anotaciones PDF** (extraerlas con pypdf; hay 8 en páginas 3–7). Mensaje central: nada de fuerza bruta; conectividad obligatoria; gateway; datos concretos.
2. `docs/LIPIcs.ITCS.2026.80.pdf` — base teórica (PartialConRBDS). Nuestro problema = su variante (i) con pesos; nuestro régimen = Δ(G_conn) acotado (§1.3), exacto.
3. `docs/algoritmo-conectado.md` — **la especificación a implementar**. Invariantes I1–I5, pseudocódigo, casos borde, plan de pruebas y fases 0–4. Si algo aquí contradice una idea nueva tuya, gana este documento o convence al equipo antes.
4. `docs/referencias-potencia-antenas.md` — potencias/radios de referencia verificados contra fuentes primarias.
5. `simulacion/docs/` — ADRs 0001–0005, runbook del pipeline, documento explicativo. `simulacion/README.md` y `README.md` raíz.

## 5. Reglas para trabajar correctamente

### Convenciones

- Documentación y mensajes de error/usuario: **español**. Identificadores de código: inglés simple, como el código existente.
- Sin dependencias nuevas de solvers: ADR 0001 decidió **sin NetworkX, sin scipy/MILP/OR-Tools**. Biblioteca estándar + dependencias ya declaradas (`geopandas, matplotlib, numpy, pyproj, rasterio, shapely`).
- Commits pequeños con mensaje en español; rama de trabajo `feat/algoritmo`.

### Invariantes que NO debes romper

- **El objetivo es la unión**: `f(S) = Σ población del ∪ C(a)`, nunca suma por antena (comentario del profesor "no sólo sumar cardinalidad"; es el obstáculo de aditividad de [1] §1.2). El motor mantiene contadores `cover[d]` con traza de deshacer.
- **Optimalidad exacta es un activo del proyecto** (§ "Solución: óptima en instancia"). El goloso es *baseline de comparación*, jamás reemplazo. Los esquemas aproximados del paper (EPAS/PAS) se documentan como techo teórico, no se implementan.
- **Desempate lexicográfico con poda estricta**: la cota poda sólo con `< best_f`, nunca `≤` — podar por empate rompe la reproducibilidad (invariante I4 de la especificación).
- **Unicidad ESU**: cada conjunto conexo se genera exactamente una vez bajo su vértice mínimo. La regla de extensiones es el vecindario exclusivo `Nexcl(a, S) = N(a) ∖ N(S)` con id mayor que la raíz ([3] Wernicke 2006, Def. 3.1): un vértice adyacente a `S` que fue descartado **nunca re-entra**. No la "simplifiques" a `vecinos ∖ ext` — genera duplicados en triángulos (verificado por fuerza bruta en todos los grafos de 4 y 5 vértices).
- **Presupuesto**: `max_evaluations` (antes `max_combinations`) con la misma semántica de `ExactLimitExceeded`. No lo elimines: es la protección de peor caso.
- **Capa geográfica intocada desde el motor**: la enumeración exhaustiva de pares con LOS es lo ÚNICO que el profesor permite mantener exhaustivo (`max_pairs`, paso ≤ medio píxel DEM, NoData ⇒ sin cobertura). No muevas esa lógica al algoritmo ni la "optimices" cambiando su semántica.
- **Candidatos por criterio, no grilla** (ADR 0007): generación determinista — anclas en localidades, intersecciones Murray–Tong de circunferencias de radio ρ, sitios altos con supresión no-máxima; filtros de NoData, pendiente (`max_slope_deg`), proximidad (`candidate_separation_m`: sin ella el puntaje empata y el tope llena la instancia de duplicados — lección de Yumbel) y establecimientos sensibles; tope `max_candidates` por población alcanzable. En ventanas amplias escalar la separación como √(área/n). No volver a la retícula regular ni "simplificar" las intersecciones.
- **PRC = screening, no permiso** (ADR 0005). Los outputs no sobreprometen: no certifica cobertura radioeléctrica ni factibilidad (Ley 20.599 / LGUC 116 bis F: torres > 12 m requieren recepción municipal).

### Cómo verificar

```bash
cd simulacion
uv sync --locked
uv run pytest -q                    # los tests existentes deben seguir verdes
uv run ruff check .
uv run ruff format --check .
```

- Los tests comparan el motor contra un **oracle independiente** (combinaciones + filtro); deben seguir pasando y extenderse a conectividad + gateways.
- **Regresión obligatoria**: Biobío 80,44 % y Metropolitana 88,64 % deben reproducirse idénticos tras el cutover (mismo valor óptimo; deben bastar menos evaluaciones).
- Los datos GIS pesados (`simulacion/data/*.rar`) no están en git; si no existen localmente, valida con instancias sintéticas y NO inventes resultados de pilotos.
- Cada corrida real va a un directorio nuevo bajo `simulacion/outputs/`; `outputs/` no se commitea.

### Trampas conocidas

- La propuesta PDF entregada dice "enumeración exacta": el informe final (fase 3, hecho — §2 de `informe/informe-final.tex`) presenta el nuevo algoritmo y su justificación (paper ITCS + régimen Δ acotado) explicando el cambio, sin contradecir la versión entregada a secas.
- El número de combos de Yumbel a 5 km de espaciado sería `C(121,5) ≈ 1,99·10⁸` > presupuesto: por eso existe la fase 0 de medición (contar subconjuntos conexos reales y Δ̄ antes de prometer rendimientos).
- Este archivo, `docs/algoritmo-conectado.md` y `NOTA-ESTADO.md` deben mantenerse al día con el estado real; si cambias el alcance, actualízalos en el mismo commit.

## 6. Mapa rápido del repositorio

```text
README.md, NOTA-ESTADO.md             portada y estado
docs/                                  propuesta comentada (G8), paper ITCS,
                                       especificación del algoritmo, referencias de potencia
propuesta-primera-entrega/, informe/   entregables académicos (PDF/tex)
simulacion/
  src/
    pipeline.py          orquestador CLI (python -m src.pipeline --config ...)
    config.py            PipelineConfig (validaciones; k, max_*, radios futuros)
    data/                DEM, población SUBDERE, OSM, preparación
    geo/                 área, criterio de candidatos, PRC + establecimientos sensibles, cobertura+conectividad LOS, elevación
    graph/               CoverageGraph/Solution (models.py), builder
    algorithms/          exact.py (placeholder a reemplazar) → connected.py (spec)
    evaluation/          metrics.py
    visualization/       mapa PNG y payload de terreno para web
  tests/                 test_algorithms.py (oracle), test_geo.py, test_data_pipeline.py
  configs/               biobio.toml, metropolitana.toml, yumbel-50km-prc.toml
  web-conectividad/        visor estático (consume outputs; no tocar el motor por él)
prc-mapas/               GeoJSON PRC Biobío + descargador
```

Los scripts de reporte (`simulacion/docs/report/`): `generate_figures.py`,
`generate_segment_map.py` y `medicion_fase0.py` (medición del régimen Δ).

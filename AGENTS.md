# AGENTS.md — contexto para asistentes de IA

Archivo de orientación para cualquier IA (o persona) que trabaje en este repositorio. Contiene qué es el proyecto, en qué estado está, qué falta hacer y cómo abordarlo sin romper decisiones ya tomadas.

## 1. Qué es este proyecto

Proyecto universitario (Grafos y Algoritmos, prof. Karol Suchan): **optimización de cobertura territorial mediante grafos**. Herramienta de prefactibilidad para conectividad rural en Chile: dado un área, localidades con población (SUBDERE/Censo) y un DEM real (ALOS/Copernicus), selecciona hasta `k` sitios de antena maximizando la **población única cubierta**, con cobertura definida por distancia + línea de vista (LOS) sobre el relieve. Los Planes Reguladores Comunales (PRC) filtran candidatos como *screening territorial* — nunca como permiso de construcción.

Pilotos ya ejecutados: Biobío 4.210/5.234 hab (80,44 %), Metropolitana 25.119/28.337 hab (88,64 %), `k=5`. Evidencia local en `simulacion/outputs/` (no versionada).

## 2. Estado actual (noviembre 2026)

- **Simulación V1 terminada** con enumeración exacta por fuerza bruta (`simulacion/src/algorithms/exact.py`). El profesor dejó claro en su retroalimentación que esto era un placeholder de prueba.
- **Rama activa: `feat/algoritmo`**. Último commit: `fce1f64` (documentación). Push pendiente: la clave SSH del equipo autentica como `not-narleeek`, sin acceso a `CarlosGebard/proyecto-grafos` — revisar si ya se resolvió antes de empujar.
- El motor nuevo **aún no está implementado**; existe la especificación completa aprobada conceptualmente con el equipo: `docs/algoritmo-conectado.md`.

## 3. Mandato de la rama (qué hay que hacer)

1. **Reemplazar la fuerza bruta** por el motor exacto de la especificación: enumeración canónica de subconjuntos conexos (ESU, Wernicke 2006) + unión incremental del objetivo + cotas + desempate lexicográfico. Nada de heurísticas como solución principal.
2. **Extender el modelo** según la retroalimentación del profesor:
   - LOS entre antenas formalizada en el modelo (`G_conn`) — ya se calcula, falta formalizarla en documentos.
   - Gateways / puntos de acceso a Internet (`S ∩ G ≠ ∅`).
   - Potencia de antena → radio efectivo por clase (`docs/referencias-potencia-antenas.md` tiene los valores verificados).
   - Umbral de cobertura `t` (variantes de decisión: mínimo m para t; ¿k alcanza t?).
3. **Baseline goloso** para el contraste rápido-vs-óptimo (la propuesta lo promete explícitamente).
4. **Actualizar docs/ADRs** tras el cutover (ADR 0006 nuevo; ADR 0002; `ESTADO.md`; `NOTA-ESTADO.md` tiene un ítem desactualizado: la conectividad LOS entre antenas YA existe en `src/geo/coverage.py:compute_connectivity` y `exact_connected`).

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
- **Unicidad ESU**: cada conjunto conexo se genera exactamente una vez bajo su vértice mínimo. No "simplificar" la regla de extensiones (los vecinos descartados en niveles ancestros SÍ pueden re-entrar; es lo que garantiza unicidad).
- **Presupuesto**: `max_combinations` se sustituye por `max_evaluations` con la misma semántica de `ExactLimitExceeded`. No lo elimines: es la protección de peor caso.
- **Capa geográfica intocada desde el motor**: la enumeración exhaustiva de pares con LOS es lo ÚNICO que el profesor permite mantener exhaustivo (`max_pairs`, paso ≤ medio píxel DEM, NoData ⇒ sin cobertura). No muevas esa lógica al algoritmo ni la "optimices" cambiando su semántica.
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

- `NOTA-ESTADO.md` dice "Conectividad/LOS entre antenas: pendiente" — **desactualizado**; el grafo LOS ya se construye. No lo dupliques.
- La propuesta PDF entregada dice "enumeración exacta": el informe final (fase 3) debe presentar el nuevo algoritmo y su justificación (paper ITCS + régimen Δ acotado), no contradecir la versión entregada sin explicar el cambio.
- El número de combos de Yumbel a 5 km de espaciado sería `C(121,5) ≈ 1,99·10⁸` > presupuesto: por eso existe la fase 0 de medición (contar subconjuntos conexos reales y Δ̄ antes de prometer rendimientos).
- Este archivo, `docs/algoritmo-conectado.md` y `NOTA-ESTADO.md` deben mantenerse al día con el estado real; si cambias el alcance, actualízalos en el mismo commit.

## 6. Mapa rápido del repositorio

```text
README.md, ESTADO.md, NOTA-ESTADO.md   portada y estado
docs/                                  propuesta comentada (G8), paper ITCS,
                                       especificación del algoritmo, referencias de potencia
propuesta-primera-entrega/, informe/   entregables académicos (PDF/tex)
simulacion/
  src/
    pipeline.py          orquestador CLI (python -m src.pipeline --config ...)
    config.py            PipelineConfig (validaciones; k, max_*, radios futuros)
    data/                DEM, población SUBDERE, OSM, preparación
    geo/                 área, grilla candidatos, PRC, cobertura+conectividad LOS, elevación
    graph/               CoverageGraph/Solution (models.py), builder
    algorithms/          exact.py (placeholder a reemplazar) → connected.py (spec)
    evaluation/          metrics.py
    visualization/       mapa PNG y payload de terreno para web
  tests/                 test_algorithms.py (oracle), test_geo.py, test_data_pipeline.py
  configs/               biobio.toml, metropolitana.toml, yumbel-50km-prc.toml
  web/, web-conectividad/  visores estáticos (consumen outputs; no tocar el motor por ellos)
prc-mapas/               GeoJSON PRC Biobío + descargador
```

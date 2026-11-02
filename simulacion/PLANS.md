# Pipeline geoespacial V1

## Objetivo y alcance
Feature / data pipeline: ejecutar datos reales → candidatos → LOS → grafo bipartito → maximum coverage ponderado → métricas y mapa. Mantener módulos pequeños, sin frontend ni propagación electromagnética.

Referencia principal confirmada por el usuario: [`../propuesta-primera-entrega/entregables/propuesta-inicial.pdf`](../propuesta-primera-entrega/entregables/propuesta-inicial.pdf), leído completo antes de implementar. Trazabilidad entre sus secciones y el código en `docs/propuesta.md`.

## Estado inspeccionado
Sólo existen la propuesta PDF y seis archivos en `data/` (incluyendo SHP.rar de SUBDERE y DEM ALOS de Biobío.rar con JP2). No hay código, tests, configuración, skills locales ni historial Git accesible.

## Supuestos
- Primera prueba real: bbox pequeño de Biobío, aprovechando el DEM ya disponible.
- La demanda conserva población censal y geometría; un punto interior representa cada polígono. Selección por punto representativo, sin prorratear población por área.
- Coordenadas de entrada WGS84; cálculo en UTM local. NoData implica ausencia de evidencia de cobertura, nunca altura cero.
- ALOS local tiene prioridad; Copernicus GLO-30 es alternativa explícita para áreas sin DEM local. Presets regionales son ventanas piloto, no límites administrativos.

## Pasos
1. Inspeccionar atributos SHP, metadatos y DEM; preparar entorno reproducible.
2. Implementar carga/preparación, área métrica, candidatos y LOS reemplazable.
3. Implementar grafo y enumeración exacta acotada.
4. Integrar CLI, configuración TOML, métricas, GeoJSON, grafo JSON y mapa.
5. Añadir tests, ADR y runbook; ejecutar prueba sintética controlada y prueba end-to-end con archivos reales.

## Validación
`uv run pytest`, `uv run ruff check .`, `uv run ruff format --check .`, `uv run python -m src.pipeline --region biobio --k 5 --candidate-spacing 5000 --max-distance 30000`; inspeccionar métricas y mapa. Comprobar CLI, entradas inválidas, pesos únicos, exacto contra enumeración independiente y bloqueo por relieve/NoData.

## Riesgos
Representar polígonos completos por un punto aproxima cobertura. Resolución de muestreo y calidad del DEM limitan LOS; no se modela curvatura terrestre, Fresnel ni pérdidas de señal. El SHP no debe confundirse con un censo actualizado. Preservar originales y registrar procedencia. Limitar candidatos, pares, píxeles y enumeraciones para evitar ejecuciones enormes.

## Estado y evidencia

Pasos 1–5 completados. Se añadieron los módulos previstos, configuración TOML, tests, README, ADR y runbook.

- Entorno creado con `uv sync`; versiones fijadas en `uv.lock`. La caché externa de uv requirió escalación; posteriormente las comprobaciones locales usaron `.venv/bin/`.
- `.venv/bin/pytest -q`: 25 tests aprobados. Avisos `PendingDeprecationWarning` internos de Rasterio/Affine, sin errores. Incluye integración end-to-end, exacto omitido, datos desconocidos, cambio de CRS, mosaico multitie y NoData original igual a cero.
- `.venv/bin/ruff check .` y `.venv/bin/ruff format --check .`: comprobaciones finales de código.
- Extracción con `prepare_population()` y `prepare_alos()` desde copias enlazadas de los RAR en un directorio temporal limpio: ambos archivos preparados correctamente.
- Piloto exacto Biobío: 82 localidades, 20 candidatos, 224 aristas y 4.210 habitantes cubiertos. Mapa inspeccionado visualmente.
- Piloto exacto Metropolitana: 310 localidades, 19 candidatos, 1.639 aristas y 25.119 habitantes cubiertos. Mapa inspeccionado visualmente.
- No hay configuración de typecheck, servicios ni build de aplicación que validar. El paquete se ejecuta como `python -m src.pipeline`. No se creó commit: `.git` no contiene un repositorio Git operativo en este entorno.

## Informe LaTeX y PDF

Objetivo: entregar un informe visual en español sobre la implementación, manteniendo el PDF de propuesta como documento rector. Alcance: documento LaTeX editable, PDF compilado, figuras derivadas de los resultados reales y paquete de fuentes. No modificar el pipeline.

Pasos: (1) leer métricas/manifiestos y código relevante; (2) crear mapas de relieve, perfiles LOS reales, matriz bipartita y comparaciones; (3) redactar y compilar LaTeX; (4) renderizar e inspeccionar cada página; (5) entregar fuentes y PDF.

Supuestos: usar las ejecuciones `outputs/biobio-v1` y `outputs/metropolitana-v1`. Los tiempos son observaciones individuales, no benchmarks. Riesgos: confundir cobertura puntual con uniforme, dibujar grafos saturados o generar texto demasiado pequeño; resolver con leyendas explícitas, matriz completa y páginas con jerarquía clara.

Validación: contrastar figuras con JSON, compilación sin errores ni desbordes, extracción de texto, renderizado Poppler y revisión visual de todas las páginas.

Estado: completado. Informe de nueve páginas en `output/pdf/informe_pipeline.pdf`, fuente `.tex`, ocho figuras, valores generados desde métricas y ZIP íntegro de 14 archivos. `build.sh` compiló correctamente en dos pasadas con pdfLaTeX; el log final no contiene advertencias, caracteres faltantes ni desbordes. Se extrajo y contrastó el texto, se revisaron visualmente las nueve páginas y se verificaron los perfiles contra aristas reales, la matriz de 224 aristas y las ganancias que suman 4.150 habitantes. La comprobación de formato/lint del script de figuras también pasó. La inicialización de TeX requirió resolver formatos/fuentes ausentes; la entrega usa un formato local reproducible y fuentes estándar.

## Organización en dos repositorios

### Objetivo

Separar la primera entrega documental del simulador reproducible bajo el nombre del proyecto **Optimización de Cobertura Territorial mediante Grafos**.

### Alcance y supuestos

- `propuesta-primera-entrega/` contendrá únicamente el documento de propuesta, sus futuras fuentes, figuras y anexos.
- `simulacion/` contendrá código, datos, configuraciones, pruebas, resultados y documentación técnica existente.
- Esta reorganización no modifica el modelo, los algoritmos, los datos ni los resultados generados.
- Ambos directorios quedan listos para inicializarse como repositorios Git independientes; no se inicializan repositorios ni se eliminan archivos en esta etapa.

### Pasos y validación

1. Crear la estructura documental y trasladar el PDF de propuesta como referencia inicial.
2. Trasladar los artefactos del simulador conservando sus rutas internas relativas.
3. Añadir README en la raíz y en la propuesta; ajustar los enlaces del README y la trazabilidad del simulador.
4. Verificar el árbol resultante, enlaces Markdown locales y las comprobaciones Python desde `simulacion/`.

### Riesgo

Un entorno virtual ubicado en la raíz conserva rutas absolutas previas; no se mueve ni se reutiliza como parte de esta separación. Al crear cada repositorio se deberá instalar su entorno de forma independiente.

## Documento explicativo

### Objetivo

Crear una explicación simple y trazable del problema, los datasets y la solución, diferenciando la simulación V1 implementada de los insumos previstos para la versión final.

### Alcance

- Crear `docs/documento-explicativo.md` con una primera sección autónoma.
- Explicar problema, datasets, construcción del grafo, enumeración exacta y resultados.
- Declarar explícitamente que el Censo 2024 y el filtro PRC son objetivos de la versión final y no funcionalidades ya incorporadas al pipeline V1.

### Validación

- Contrastar la redacción con `src/pipeline.py`, las configuraciones y el runbook.
- Verificar enlaces internos y estructura Markdown.

### Estado y evidencia

Completado. Se creó `docs/documento-explicativo.md` y su versión académica en `output/pdf/documento-explicativo.pdf`, con fuente LaTeX editable. El contenido se contrastó con `src/pipeline.py`, `src/config.py` y el runbook: declara que SUBDERE/Censo 2017 es la fuente de la simulación V1, mientras que Censo 2024 y PRC siguen planificados. El PDF se compiló en dos pasadas, tiene cuatro páginas A4, no presenta errores ni desbordes en el log final y se revisó visualmente página por página tras renderizarlo con Poppler.

## Migración a solución exacta

La simulación se simplificó para utilizar únicamente enumeración exacta. Se retiraron el algoritmo alternativo, la brecha comparativa, las salidas históricas asociadas y el informe visual anterior. El pipeline ahora requiere que el número de combinaciones sea manejable; de lo contrario termina con `ExactLimitExceeded`. Se regeneraron los pilotos en `outputs/biobio-exacto/` y `outputs/metropolitana-exacto/`, sus capas y mapas. El anexo `output/pdf/figuras-simulacion-exacta.pdf` reúne los gráficos del territorio, perfiles LOS, matriz del grafo, contribuciones, mapas y cobertura de ambas soluciones óptimas.

## Piloto web interactivo: Biobío

### Objetivo

Crear una página web local y estática para explicar visualmente la solución exacta del piloto de Biobío: localidades, candidatos de antena, cinco ubicaciones seleccionadas y la población única que incorpora cada selección.

### Alcance y supuestos

- La página vive en `web/` y consume los artefactos existentes de `outputs/biobio-exacto/`; no ejecuta el pipeline ni modifica sus resultados.
- Se representa la geografía exportada por el pipeline y se calcula la ganancia marginal desde `graph.json` y los pesos de población, para no inventar valores de animación.
- No se agregan dependencias de frontend ni un servicio backend. Para verla localmente se usa un servidor HTTP estático desde la raíz de `simulacion/`.
- El sitio explica cobertura geométrica del modelo, no cobertura radioeléctrica ni factibilidad de construcción.

### Pasos

1. Crear la estructura mínima HTML, CSS y JavaScript, con una estética cartográfica sobria y controles accesibles.
2. Cargar GeoJSON, métricas y grafo reales; renderizar el mapa SVG con localidades y los 20 candidatos.
3. Implementar la secuencia de cinco selecciones, controles de reproducción, avance y reinicio, y actualizar el mapa y métricas en cada paso.
4. Documentar el modo de ejecución y verificar que las métricas iniciales y finales coinciden con `metrics.json`.

### Validación

- Ejecutar comprobación de sintaxis JavaScript.
- Servir `simulacion/` por HTTP, comprobar que responde la página y revisar visualmente los estados inicial, intermedio y final.
- Contrastar que el último paso muestra 4.210 habitantes, 80,44% y cinco antenas, iguales a `outputs/biobio-exacto/metrics.json`.

### Riesgos

- Los archivos bajo `outputs/` están ignorados por Git; la página requiere una ejecución Biobío disponible antes de ser servida.
- El SVG representa la información exportada en WGS84 y no incorpora una cartografía base externa, para mantener el piloto reproducible y sin dependencia de red.

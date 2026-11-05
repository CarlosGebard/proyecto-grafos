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

## Cobertura conectada y visor didáctico

### Objetivo

Extender la simulación para exigir que las antenas elegidas formen un único componente conectado por línea de vista, y crear un visor estático que explique visualmente demanda, candidatos, aristas de cobertura, enlaces entre antenas y selección conectada.

### Alcance y supuestos

- No hay gateway: una solución es válida si todas sus antenas seleccionadas están conectadas entre sí.
- Un enlace entre dos antenas requiere distancia menor o igual a `max_distance_m` y LOS sobre el mismo DEM; ambos extremos usan `antenna_height_m`.
- La solución de cobertura original permanece como referencia. La nueva solución exacta conectada se calcula y exporta por separado.
- El visor vive en `web-conectividad/`, no requiere backend ni dependencias de JavaScript, e incluye un ejemplo pequeño cuando todavía no hay resultados geográficos regenerados.
- Esta extensión conserva el alcance de prefactibilidad: no representa capacidad, gateway, permisos ni cobertura radioeléctrica certificada.

### Pasos

1. Construir y exportar un grafo no dirigido de enlaces LOS entre candidatos.
2. Agregar enumeración exacta conectada, con pruebas para conjunto conectado, desconectado y límite de combinaciones.
3. Exportar ambas métricas y el nuevo `connectivity.json` desde el pipeline.
4. Crear visor SVG con secuencia controlable: localidades, candidatos, cobertura, enlaces entre antenas y solución conectada.
5. Documentar el contrato de salida, ejecución local y decisión de arquitectura.

### Validación

- Ejecutar `uv run pytest -q`, `uv run ruff check .` y `uv run ruff format --check .` desde `simulacion/`.
- Validar sintaxis de JavaScript con `node --check`.
- Servir `simulacion/` por HTTP y comprobar el ejemplo didáctico y la carga condicional de resultados Biobío.

### Riesgos

- La enumeración conectada revisa tamaños de uno a `k`, porque una solución conectada no siempre puede ampliarse sin perder conectividad.
- Los resultados existentes no contienen enlaces entre candidatos; deben regenerarse para habilitar la vista real.

## Relieve 3D del piloto

### Objetivo

Visualizar el DEM real de un piloto como relieve 3D interactivo, con localidades, candidatos y enlaces superpuestos, evitando la sobrecarga visual de todas las aristas 2D simultáneas.

### Alcance y supuestos

- El pipeline exportará una versión reducida y sin datos personales del DEM como `terrain.json`; el GeoTIFF original permanece intacto.
- El visor usará Canvas 2D con proyección de perspectiva y controles de arrastre, sin dependencias externas ni WebGL.
- El relieve 3D sólo se habilita cuando existe `terrain.json`. El mapa 2D y el ejemplo didáctico se mantienen como alternativas.

### Pasos

1. Reducir el DEM a una grilla de tamaño acotado y exportar sus elevaciones, límites WGS84 y rango vertical.
2. Añadir esa salida al pipeline, pruebas y documentación.
3. Renderizar la malla del relieve, marcadores y enlaces en Canvas; habilitar rotación y reinicio de vista.
4. Mostrar sólo los enlaces pertinentes a la etapa o solución seleccionada.

### Validación

- Comprobar que `terrain.json` sólo contiene valores finitos o nulos y una grilla acotada.
- Ejecutar pruebas, lint, formato y sintaxis JavaScript.
- Generar el terreno desde el DEM Biobío existente y cargar la pestaña 3D por HTTP.

### Riesgos

- La reducción suaviza detalles pequeños del terreno; sirve para explicar relieve, no para sustituir el cálculo LOS original.
- Canvas 2D entrega una vista 3D didáctica, no un visor GIS profesional.

## Caminos OpenStreetMap en relieve

### Objetivo

Exportar caminos OpenStreetMap de la ventana del piloto como GeoJSON y superponerlos sobre el relieve 3D, con atribución visible y sin reutilizar cartografía de Google.

### Alcance y supuestos

- La descarga es opcional mediante `--download-osm-roads`; el pipeline no incorpora red por defecto.
- Se consultan únicamente vías `highway` dentro del bbox del estudio y se exportan geometrías, tipo y nombre cuando existen.
- La vista 3D dibuja las vías como líneas ajustadas al DEM; no implementa navegación, geocodificación ni descarga de tiles.

### Pasos

1. Añadir cliente OSM/Overpass y conversión de respuesta a GeoJSON.
2. Exportar `roads.geojson`, procedencia y atribución cuando se solicita la descarga.
3. Mostrar caminos sobre relieve y corregir la superposición de leyendas en la vista 3D.
4. Validar el parser sin red y descargar la capa del piloto actual de forma explícita.

### Validación

- Probar que la conversión conserva sólo vías válidas y produce LineString.
- Ejecutar pruebas, lint, formato y sintaxis JavaScript.
- Comprobar que `roads.geojson` del piloto contiene atribución OSM y que el visor lo carga.

## Simulación 50 × 50 km con restricciones PRC

### Clasificación

Feature, data pipeline, contract change y documentación. Cambia el conjunto factible de ubicaciones de antena; no cambia la definición de cobertura ni el requisito de conectividad ya implementados.

### Objetivo

Ejecutar y visualizar una nueva simulación de **50 × 50 km métricos** centrada en Yumbel por defecto, donde cada antena candidata usada por la optimización tenga una decisión territorial trazable derivada de los mapas PRC: admisible, excluida o sin clasificación. La solución final seguirá maximizando población cubierta y exigirá que las antenas elegidas formen un único componente conectado por LOS.

### No alcance

- No se afirmará que el resultado equivale a un permiso de construcción, una concesión de telecomunicaciones o una aprobación municipal.
- No se decidirá compatibilidad de torres desde texto legal ambiguo ni se inventarán permisos donde el PRC no cubra el terreno.
- No se modelarán predios, propietarios, servidumbres, capacidad, backhaul, permisos sectoriales, impacto ambiental, costos ni radioenlaces certificados.
- No se sustituirán los pilotos actuales ni se alterarán sus resultados.
- No se descargará ni reutilizará cartografía de Google.

### Estado comprobado y supuestos explícitos

- `prc-mapas/prc_biobio/` contiene 51 capas GeoJSON descargadas desde el servicio IPT/PRC Biobío de MINVU. `49_PRC_Yumbel.geojson` contiene 319 polígonos WGS84 con `ZONA`, `NOMBRE`, `UPERM`, `UPROH` e `IPT`.
- Yumbel PRC cubre varias áreas urbanas, no un cuadrado continuo de 50 km. En una ventana mayor habrá territorio **sin clasificación PRC**; en modo estricto no será candidato válido.
- El DEM ALOS de Biobío está disponible y el pipeline trabaja en UTM. Un cuadrado de 50 km no debe representarse con una aproximación fija en grados: se construirá en metros desde un centro WGS84 y se reproyectará.
- La enumeración exacta tiene límite de combinaciones. Una grilla de 5 km sobre 50 km puede superar ampliamente ese límite; se hará una pre-ejecución que informe número de candidatos y combinaciones, sin reducirlos en silencio.
- Centro propuesto mientras no se indique otro: centroide del conjunto PRC Yumbel aproximado en `(-72.556409, -37.127679)`. Es una elección de trabajo, no una delimitación comunal oficial.

### Contrato de restricciones

1. Cada regla se almacenará en una configuración versionada, con identificador, fuente, tipo (`allow`, `exclude`, `unknown`), capas/zona PRC afectadas y distancia de resguardo opcional en metros.
2. La configuración inicial sólo podrá codificar restricciones inequívocas y revisadas: cuerpos de agua, áreas verdes, espacio público, drenajes, zonas de inundación/riesgo y capas explícitas de “zona no edificable”, cuando correspondan al área. Los nombres concretos de zonas admisibles requerirán validación del usuario o de la autoridad competente antes de activarse.
3. Las geometrías lineales (por ejemplo, gasoductos) se convertirán en exclusiones mediante un buffer configurable y documentado; no se asumirá un ancho sin una fuente.
4. Se disolverán intersecciones y se aplicará una precedencia fija: `exclude` > `allow` > `unknown`. La decisión, capa, zona y regla causante quedarán como atributos de cada candidato y en el manifiesto.
5. En `strict` sólo se entregarán a la optimización candidatos `allow`; `screening` permitirá `unknown` pero los marcará visualmente. La ejecución oficial de “cumple PRC” será siempre `strict`.

### Hitos de implementación

1. **Inventario y perfilado normativo**
   - Propósito: convertir los GeoJSON PRC en una fuente auditable antes de usarlos como restricción.
   - Acciones: validar CRS, geometrías, campos y solapes; construir un inventario de capas poligonales y lineales aplicables a la ventana elegida; registrar fechas y textos `IPT`; identificar coberturas ausentes.
   - Entregables: informe de perfilado JSON/Markdown y configuración inicial de reglas con toda decisión marcada como revisada o pendiente.
   - Validación: pruebas de CRS/validez, conteos reproducibles y revisión manual de las zonas que se pretenden permitir o excluir.

2. **Área métrica de 50 × 50 km y preflight de recursos**
   - Propósito: definir la nueva área exactamente en kilómetros y evitar ejecuciones exactas inviables.
   - Acciones: añadir parámetros compatibles hacia atrás `center` y `study_size_m`; crear el cuadrado en UTM local, exportar su polígono WGS84 y medir sus lados; crear preflight de tamaño DEM, candidatos, pares LOS y combinaciones exactas.
   - Valores iniciales a evaluar: DEM remuestreado a 25 m (aprox. 4 millones de píxeles), grilla de 10 km y `k=5`. Si la combinación exacta excede el límite, el preflight detendrá la ejecución y propondrá espaciados; no eliminará candidatos por heurística.
   - Touch points: `src/config.py`, `src/geo/area.py`, `src/pipeline.py`, configuración TOML, pruebas de área/configuración.
   - Validación: lados de 50 000 m ± tolerancia numérica, CRS UTM esperado, límites de recursos y mensaje claro ante una grilla inviable.

3. **Motor PRC de elegibilidad**
   - Propósito: transformar capas normativas heterogéneas en una decisión por punto candidato.
   - Acciones: crear módulo de carga, reproyección, disolución, buffers y clasificación; aceptar archivos individuales o un manifiesto de capas; producir `constraints.geojson` y una tabla/auditoría por regla.
   - Touch points: nuevo `src/data/prc.py` y `src/geo/constraints.py`, tipos de candidatos, pipeline y pruebas sintéticas.
   - Validación: casos controlados para precedencia, solapes, puntos en borde, geometrías lineales con buffer, zona desconocida y CRS distinto.

4. **Generación de candidatos restringida y optimización conectada**
   - Propósito: asegurar que sólo los puntos permitidos entren al grafo oficial.
   - Acciones: generar la grilla métrica como hoy, asociar atributos PRC, conservar todos los puntos para explicar exclusiones y usar sólo `allow` en modo estricto; mantener cobertura, LOS, conectividad y exacto conectado sobre el subconjunto válido.
   - Entregables: `candidates.geojson` con `constraint_status`, `constraint_rule`, `prc_zone`; `excluded_candidates.geojson`; auditoría en `manifest.json` con conteos por causa.
   - Validación: una solución no contiene candidatos excluidos, el grafo no referencia candidatos filtrados, y la falta de candidatos permitidos termina con un error accionable.

5. **Configuración de la corrida Yumbel-50**
   - Propósito: dejar una corrida reproducible, separada de Biobío piloto.
   - Acciones: crear `configs/yumbel-50km-prc.toml` con centro, lado, DEM, fuente de población, GeoPackage OSM local, reglas PRC, modo `strict`, separación validada en preflight y una nueva salida `outputs/yumbel-50km-prc-*`.
   - Dependencia: aprobar la tabla de zonas `allow` y los buffers de restricciones lineales. Hasta entonces se podrá generar sólo un diagnóstico `screening`, nunca nombrarlo “cumple PRC”.
   - Validación: ejecución desde una salida vacía, `manifest.json` completo, huellas de todas las fuentes y comprobación de que el área mide 50 × 50 km.

6. **Visualización didáctica de restricciones**
   - Propósito: hacer visible por qué aparecen o desaparecen ubicaciones y distinguir relieve, población, caminos y regulación.
   - Acciones: añadir una pestaña/escenario “Yumbel 50 km · PRC”; ampliar la vista 3D y 2D a la nueva extensión; dibujar PRC con leyenda y transparencias; permitir encender/apagar restricciones; mostrar al seleccionar un candidato su zona, regla y estado; incluir un resumen de cuántos puntos fueron excluidos por cada motivo.
   - Criterio visual: conservar elevación vertical explícita `×10`, mostrar los ejes en km y evitar que leyendas cubran escalas o mapa.
   - Validación: sintaxis JavaScript, carga sin red salvo archivos locales ya disponibles, contraste de conteos mostrados contra `manifest.json` y revisión manual de estados permitido/excluido/desconocido.

7. **Documentación, ADR y entrega**
   - Propósito: no confundir filtro de planificación con permiso legal.
   - Acciones: crear ADR de precedencia/modos PRC; actualizar README, documento explicativo y runbook con fuentes MINVU, atribución, comando, límites y recuperación; actualizar esta sección del plan con evidencia de la corrida.
   - Validación: enlaces locales, documentación consistente con contrato/configuración y revisión de términos (“screening” versus “cumple PRC”).

### Validación final de extremo a extremo

1. `uv run pytest -q`.
2. `uv run ruff check .` y `uv run ruff format --check .` para archivos propios del simulador.
3. `node --check web-conectividad/app.js`.
4. Preflight de Yumbel-50: área de 50 000 m por lado, píxeles DEM, candidatos, pares y combinaciones dentro de límites explícitos.
5. Corrida desde un directorio de salida vacío con `strict`; verificar `manifest.json`, hashes, decisión de cada candidato, ausencia de excluidos en la solución, conectividad y métricas.
6. Servir el visor localmente y revisar inicio, filtro PRC, pasos de cobertura y solución final contra los GeoJSON exportados.

### Riesgos y recuperación

- **Ambigüedad normativa:** detener antes de activar `allow` si los usos del PRC no autorizan de forma inequívoca infraestructura de telecomunicaciones. Recuperación: mantener modo `screening` y pedir resolución normativa.
- **Cobertura PRC parcial:** un mapa de 50 km puede quedar mayoritariamente como `unknown`; en modo estricto eso puede dejar cero candidatos. Recuperación: elegir otra ventana o sumar fuentes normativas oficiales, sin tratar el vacío como permiso.
- **Carga computacional:** un DEM fino o demasiados candidatos hace inviables LOS/exacto. Recuperación: remuestrear explícitamente el DEM o aumentar separación después del preflight y documentar el cambio.
- **Datos desactualizados o superpuestos:** conservar archivos originales, `IPT`, huellas y fecha de descarga; priorizar exclusión ante conflicto y registrar el solape.
- **Interpretación visual:** la elevación sigue exagerada 10× sólo para lectura; la leyenda y documentación deben declararlo.

### Estado y evidencia

Implementado como primera corrida de *screening* territorial. `configs/yumbel-50km-prc.toml` construye un cuadrado UTM de 50 000 m por lado centrado en Yumbel, usa DEM ALOS a 25 m, 23 candidatos de grilla de 10 km y el GeoPackage OSM local. La ejecución `outputs/yumbel-50km-prc-screening/` cargó 435 localidades, exportó 877 geometrías PRC (225 exclusiones), 6.509 caminos, 440 aristas de cobertura y una solución conectada de 12.840 habitantes con cinco antenas. Ningún punto de esta grilla cayó dentro de una exclusión; por eso los 23 permanecen como `unknown` y el resultado no se llama cumplimiento PRC. El visor `web-conectividad/` incorpora la pestaña Yumbel y superpone las exclusiones en rojo.

### Capa PRC explícita en el visor

**Clasificación:** feature de visualización. **Objetivo:** permitir inspeccionar las exclusiones PRC ya exportadas sin presentar las zonas `unknown` como prohibidas ni alterar el modelo. **Alcance:** reutilizar `constraints.geojson` en el visor estático, añadir un control visible sólo cuando el escenario contiene exclusiones, y conservar la capa activada por defecto. **No alcance:** cambiar reglas normativas, regenerar resultados o modificar candidatos. **Validación:** `node --check web-conectividad/app.js`, revisión de HTML/CSS y comprobación de que el control sólo muestra polígonos con `constraint_status = excluded`.

**Estado y evidencia:** implementado en la vista 3D y el mapa SVG. El control `Restricciones PRC (n)` alterna los polígonos de exclusión explícita y permanece oculto en escenarios sin esa capa. `node --check web-conectividad/app.js` y `pytest -q tests/test_geo.py -k prc` finalizaron correctamente; la prueba emitió un aviso de deprecación interno de Rasterio.

### Riesgos

- Overpass es un servicio público con disponibilidad limitada; el pipeline debe fallar claramente si la descarga no responde.
- OSM requiere atribución visible y no permite descargar masivamente tiles de su servidor público.

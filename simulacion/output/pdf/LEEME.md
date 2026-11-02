# Informe del pipeline geoespacial V1

`informe_pipeline.pdf` es el documento para lectura. `informe_pipeline.tex` es la fuente editable; necesita `metrics.tex` y la carpeta `figures/`, incluidas en el ZIP de fuentes.

## Compilar

Con TeX Live y pdfLaTeX, desde esta carpeta:

```bash
sh build.sh
```

El script crea el formato de TeX y auxiliares en `build/`, realiza dos pasadas y deja el PDF en esta carpeta. No depende de fuentes comerciales ni de un servicio externo. Una instalación mínima de TeX puede necesitar los paquetes estándar utilizados al inicio del `.tex` y generar fuentes en su caché de usuario.

En una instalación LaTeX completa también basta ejecutar dos veces:

```bash
pdflatex -interaction=nonstopmode -halt-on-error informe_pipeline.tex
```

## Figuras y evidencia

Las figuras se derivan de `outputs/biobio-v1/` y `outputs/metropolitana-v1/` del repositorio. La matriz reproduce las 224 aristas de Biobío; las ganancias marginales suman 4.150 habitantes. Los perfiles son pares reales y su estado se contrasta con el grafo. `figure_data.json` conserva sus IDs y magnitudes. Los tiempos en `metrics.tex` proceden de los JSON finales; no son promedios de benchmark.

Las figuras son PDF vectoriales, con sombreado DEM rasterizado cuando corresponde; la portada es PNG. La cartografía conserva escalas métricas iguales en ambos ejes. La portada utiliza un recorte central y no muestra necesariamente todas las antenas.

Para regenerar las figuras se necesita el repositorio completo y su entorno Python:

```bash
.venv/bin/python docs/report/generate_figures.py
```

El script también se incluye en el ZIP como referencia; su ejecución requiere las rutas del repositorio. La recompilación del informe con las figuras ya incluidas no requiere Python ni los datos GIS originales.

Documento rector: [propuesta inicial](../../../propuesta-primera-entrega/entregables/propuesta-inicial.pdf). El informe diferencia la formulación de la propuesta, las decisiones de implementación, los resultados observados y los trabajos futuros.

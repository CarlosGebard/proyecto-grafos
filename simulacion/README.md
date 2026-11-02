# Optimización de Cobertura Territorial mediante Grafos - Simulación

Implementación experimental de [la propuesta inicial](../propuesta-primera-entrega/entregables/propuesta-inicial.pdf): seleccionar hasta `k` ubicaciones para maximizar población única cubierta. Construye un grafo bipartito a partir de localidades y un DEM real, y resuelve Maximum Coverage ponderado mediante enumeración exacta.

## Ejecutar

Requiere Python 3.12+, `uv` y `7z` para extraer los RAR existentes en `data/`. Con archivos SHP/GDB y DEM ya extraídos, `7z` no es necesario.

```bash
uv sync --locked
uv run python -m src.pipeline --region biobio --k 5 --candidate-spacing 5000 --max-distance 30000 --output outputs/mi-prueba
```

El primer piloto usa una ventana pequeña de Biobío y los archivos locales de SUBDERE y ALOS PALSAR. El comando extrae los datos cuando hace falta y exporta grafo, soluciones, métricas, capas GeoJSON, DEM GeoTIFF y `map.png`. Usar un directorio de salida nuevo para cada ejecución.

Para Metropolitana con Copernicus GLO-30 (descarga real desde AWS):

```bash
uv run python -m src.pipeline --config configs/metropolitana.toml
```

Los nombres de región seleccionan **ventanas piloto**, no regiones administrativas completas. Para definir otra área o utilizar ALOS propio, consultar el [runbook](docs/runbooks/pipeline.md).

## Validación

```bash
uv run pytest -q
uv run ruff check .
uv run ruff format --check .
```

## Documentación

- [Anexo visual de la simulación exacta (PDF)](output/pdf/figuras-simulacion-exacta.pdf) y sus [fuentes LaTeX](output/pdf/figuras-simulacion-exacta.tex).
- [Documento explicativo: problema, datos y solución](docs/documento-explicativo.md) y su [PDF](output/pdf/documento-explicativo.pdf).
- [Relación con el PDF y formulación científica](docs/propuesta.md).
- [Operación, fuentes, configuración y resultados](docs/runbooks/pipeline.md).
- [Decisión de arquitectura V1](docs/adr/0001-pipeline-geoespacial.md).
- [Plan y validación realizada](PLANS.md).
- [Piloto web interactivo de Biobío](web/README.md): visor local animado de las cinco ubicaciones seleccionadas.

El resultado estima cobertura geométrica en un punto interior de cada localidad; no certifica cobertura radioeléctrica ni factibilidad de instalar infraestructura.

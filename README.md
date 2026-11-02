# Optimización de Cobertura Territorial mediante Grafos

[Repositorio en GitHub](https://github.com/CarlosGebard/proyecto-grafos) para la propuesta académica y la simulación de cobertura territorial.

## Dónde estamos

La propuesta inicial y la simulación V1 están terminadas. La simulación crea un grafo de cobertura usando población y relieve, y elige exactamente hasta `k` ubicaciones para maximizar la población cubierta. Consulta [ESTADO.md](ESTADO.md) para resultados, pendientes y límites.

## Carpetas

- [propuesta-primera-entrega/](propuesta-primera-entrega/): entrega académica, informe y anexos.
- [simulacion/](simulacion/): código, datos, configuraciones, pruebas y resultados.

## Ejecutar simulación

Requiere Python 3.12+, `uv` y `7z` sólo si los archivos RAR aún no están extraídos.

```bash
git clone https://github.com/CarlosGebard/proyecto-grafos.git
cd proyecto-grafos/simulacion
uv sync --locked
uv run python -m src.pipeline --config configs/biobio.toml --output outputs/biobio-nuevo
```

## Comprobar instalación

```bash
cd simulacion
uv run pytest -q
uv run ruff check .
uv run ruff format --check .
```

Para otros comandos, fuentes de datos y resultados, ver el [README de simulación](simulacion/README.md) y el [runbook](simulacion/docs/runbooks/pipeline.md).

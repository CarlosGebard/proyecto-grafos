# Optimización de Cobertura Territorial mediante Grafos

[Repositorio en GitHub](https://github.com/CarlosGebard/proyecto-grafos) para la propuesta académica y la simulación de cobertura territorial.

## Dónde estamos

La simulación crea un grafo de cobertura usando población y relieve, compara cobertura libre con cobertura conectada y elige exactamente hasta `k` ubicaciones. Incluye un escenario de 50 × 50 km centrado en Yumbel que superpone restricciones territoriales PRC como *screening*, sin presentarlas como permiso de construcción.

## Carpetas

- [propuesta-primera-entrega/](propuesta-primera-entrega/): entrega académica, informe y anexos.
- [simulacion/](simulacion/): código, datos, configuraciones, pruebas y resultados.

## Ejecutar simulación

Requiere Python 3.12+, `uv` y `7z` sólo si los archivos RAR aún no están extraídos.

> Los archivos geoespaciales pesados (`simulacion/data/*.rar`) no se subieron a GitHub. Para ejecutar el piloto, deben estar disponibles localmente en `simulacion/data/`; el [runbook](simulacion/docs/runbooks/pipeline.md) describe las fuentes y alternativas.

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

## Visor web

El visor didáctico principal es **Yumbel 50 km · PRC**. Desde `simulacion/`:

```bash
python -m http.server 8000
```

Abrir <http://localhost:8000/web-conectividad/>. La capa PRC se puede activar desde su botón; muestra exclusiones territoriales explícitas y no permisos de instalación.

Para compartir una sesión temporal con un equipo, con el servidor local en ejecución:

```bash
cloudflared tunnel --url http://127.0.0.1:8000
```

Cloudflare entregará una URL temporal `trycloudflare.com`, activa sólo mientras se mantengan abiertos el servidor y el túnel. Para una URL estable se requiere un túnel nombrado y un dominio configurado en Cloudflare.

# Datos para Drive — piloto Biobío

Esta carpeta reúne los archivos necesarios para ejecutar localmente el piloto Biobío del proyecto. Subir ambos archivos `.rar` a una misma carpeta de Google Drive sin cambiar sus nombres.

| Archivo | Uso | Tamaño | SHA-256 |
| --- | --- | ---: | --- |
| `SHP.rar` | Localidades y población de SUBDERE. | 110,0 MB | `5ef9c25c3f0705cb519e9504342a3c8c5450ee27473a70ffb7268533ba2c53b0` |
| `DEM Alos Palsar Región del Biobío.rar` | Modelo de elevación ALOS PALSAR para el cálculo de línea de vista. | 20,6 MB | `f8e1c3f7b81f1265c171a1216c2aa1235ea92ed8dc379d8bc9fffbd605117526` |

Después de descargar los archivos desde Drive, dejarlos en `simulacion/data/` y ejecutar desde `simulacion/`:

```bash
uv sync --locked
uv run python -m src.pipeline --config configs/biobio.toml --output outputs/biobio-nuevo
```

Estos datos no se versionan en GitHub por su tamaño. Las fuentes, licencias y alternativas para otros pilotos están en el [runbook](../../docs/runbooks/pipeline.md).

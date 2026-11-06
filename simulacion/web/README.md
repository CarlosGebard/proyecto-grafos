# Piloto web de Biobío

Página estática que explica la solución exacta del piloto Biobío usando directamente los archivos de `../outputs/biobio-regresion-esu/`. No ejecuta el pipeline ni necesita dependencias de JavaScript.

Desde `simulacion/`, iniciar un servidor HTTP y abrir la ruta indicada:

```bash
python -m http.server 8000
```

Abrir <http://localhost:8000/web/>. Se requiere que exista una ejecución completa en `outputs/biobio-regresion-esu/`, en particular sus GeoJSON, `graph.json`, `metrics.json` y `manifest.json`.

Los controles muestran las cinco antenas de la solución exacta en el orden guardado por `metrics.json`. En cada paso, la ganancia se calcula nuevamente a partir de las aristas de `graph.json` y de la población, por lo que una localidad ya cubierta no incrementa el contador.

# ADR 0004: Caminos OpenStreetMap como vectores

## Contexto

El visor necesita contexto territorial para interpretar antenas y localidades. Google Maps no se puede descargar ni reutilizar como capa local sin cumplir sus condiciones de plataforma. El DEM no contiene calles ni caminos.

## Decisión

Se obtendrán vías `highway` de OpenStreetMap mediante una consulta acotada a la ventana de estudio, activada sólo por `--download-osm-roads`. Se guardarán como `roads.geojson` y se dibujarán como vectores sobre el relieve. El visor incluirá atribución visible a OpenStreetMap.

## Consecuencias

- La capa es reproducible, liviana y no depende de descargar tiles.
- Las consultas a Overpass son opcionales y sujetas a disponibilidad del servicio.
- Los caminos dan contexto visual, pero no son un criterio de cobertura ni factibilidad de instalación.

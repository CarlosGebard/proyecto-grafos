# Visor didáctico de conectividad

Página estática para explicar cobertura y conectividad LOS entre antenas. Sin paso de build y sin red: three.js y OrbitControls están vendidos en `vendor/` (ADR 0008).

Desde `simulacion/`:

```bash
python -m http.server 8000
```

Abrir <http://localhost:8000/web-conectividad/>.

Para compartir una sesión temporal, en otra terminal y con el servidor local activo:

```bash
cloudflared tunnel --url http://127.0.0.1:8000
```

La URL `trycloudflare.com` que entregue Cloudflare sólo dura mientras el túnel siga activo; no se versiona como enlace permanente.

## Relieve 3D (todos los pilotos)

Biobío, Metropolitana y Yumbel se presentan como mapa 3D de la región a todo el ancho: malla construida desde `outputs/<piloto>/terrain.json` (grilla 320, ADR 0010) con tinta hipsométrica por vértice (la misma rampa del mapa PNG, exportada por el pipeline), luz direccional 315°/45° igual al hillshade del PNG, órbita con arrastre, zoom con rueda o botones `+`/`−`, y **relieve a escala real (sin exageración vertical)**: la topografía la transmiten la geometría y el sombreado. Controles: `Reiniciar vista`, `Restricciones PRC` para mostrar u ocultar en rojo las exclusiones territoriales explícitas (screening, no permiso; ADR 0005) y el grupo de zoom.

La subdivisión territorial es parte del terreno (una misma dimensión): cada localidad se pinta como subconjunto de la grilla del DEM con una **coropleta de densidad de población (hab/km², 5 clases por cuantiles**; Brewer & Pickle 2002; ADR 0009, layout revisado en ADR 0010), iluminada como el relieve. Por construcción cada celda pertenece a lo sumo a una localidad: las zonas siguen el relieve vértice a vértice y nunca se superponen. Los puntos marcan localidades (tamaño ∝ √población) y su estado de cobertura. Las antenas y sus enlaces siguen siendo **placeholders** (marcadores cónicos y segmentos sobre posiciones reales; su integración con la solución se decide después). Al llegar al paso de solución sólo permanecen las antenas elegidas: las candidatas descartadas se remueven de la escena (y del SVG didáctico). La leyenda rotula la tinta con los cortes reales: ticks de elevación (m s. n. m.) y rangos hab/km² por clase.

Debajo de la simulación, **"Cómo se aplicó el algoritmo"** muestra cuatro fases (candidatos del criterio, cobertura distancia+LOS, selección exacta del motor, red conectada) con los números reales del escenario cargado (evaluaciones, tiempos, población; contraste con el baseline goloso). Cada tarjeta sincroniza el mapa con su fase. El recorrido de pasos del mapa vive como overlay flotante sobre el lienzo (título, readout y controles Anterior/Siguiente/Reproducir).

El ejemplo didáctico conserva el diagrama SVG paso a paso.

`terrain.json` es un artefacto de comunicación (ADR 0003): nunca se recalcula LOS desde él. Si el piloto no tiene `terrain.json` o carece de paleta, el visor muestra el mapa 2D o un aviso: regenerar con el pipeline actual.

La conectividad exige un único componente de antenas seleccionadas. No representa gateway, capacidad, permisos ni cobertura radioeléctrica certificada.

El activo `assets/radio-tower.svg` es el ícono Radio Tower de GitHub Octicons, obtenido desde Wikimedia Commons bajo licencia MIT. Fuente: <https://commons.wikimedia.org/wiki/File:Octicons-radio-tower.svg>.

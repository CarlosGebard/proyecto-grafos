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

Biobío, Metropolitana y Yumbel se presentan como mapa 3D de la región: malla construida desde `outputs/<piloto>/terrain.json` con tinta hipsométrica por vértice (la misma rampa del mapa PNG, exportada por el pipeline), luz direccional 315°/45° igual al hillshade del PNG, órbita con arrastre y zoom con rueda. Controles: `Reiniciar vista`, `Relieve vertical` (exageración ×5–×40) y `Restricciones PRC` para mostrar u ocultar en rojo las exclusiones territoriales explícitas (screening, no permiso; ADR 0005).

Las localidades se colorean por población y por estado de cobertura; las antenas y sus enlaces son **placeholders** (marcadores cónicos y segmentos genéricos sobre posiciones reales; su integración con la solución se decide después). El ejemplo didáctico conserva el diagrama SVG paso a paso.

`terrain.json` es un artefacto de comunicación (ADR 0003): nunca se recalcula LOS desde él. Si el piloto no tiene `terrain.json` o carece de paleta, el visor muestra el mapa 2D o un aviso: regenerar con el pipeline actual.

La conectividad exige un único componente de antenas seleccionadas. No representa gateway, capacidad, permisos ni cobertura radioeléctrica certificada.

El activo `assets/radio-tower.svg` es el ícono Radio Tower de GitHub Octicons, obtenido desde Wikimedia Commons bajo licencia MIT. Fuente: <https://commons.wikimedia.org/wiki/File:Octicons-radio-tower.svg>.

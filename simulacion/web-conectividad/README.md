# Visor didáctico de conectividad

Página estática para explicar cobertura y conectividad LOS entre antenas. No tiene dependencias ni ejecuta el pipeline.

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

La página permite alternar entre un ejemplo pequeño, los mapas 2D de los pilotos Biobío (`outputs/biobio/`) y Metropolitana (`outputs/metropolitana/`), ambos con generación por criterio (ADR 0007), y `Yumbel 50 km · PRC + clases (criterio)` (`outputs/yumbel-criterio/`, misma generación por criterio con clases de potencia 30/12/6 km, relieve 3D y el control `Restricciones PRC` para mostrar u ocultar en rojo las exclusiones territoriales explícitas). Las demás zonas siguen como “sin clasificación” y no se presentan como prohibidas. La conectividad exige un único componente de antenas seleccionadas. No representa gateway, capacidad, permisos ni cobertura radioeléctrica certificada.

El activo `assets/radio-tower.svg` es el ícono Radio Tower de GitHub Octicons, obtenido desde Wikimedia Commons bajo licencia MIT. Fuente: <https://commons.wikimedia.org/wiki/File:Octicons-radio-tower.svg>.

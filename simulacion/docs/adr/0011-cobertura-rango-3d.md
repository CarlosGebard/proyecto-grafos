# ADR 0011: Cobertura como rango nominal ρ(a) en 3D

## Contexto

En el visor 3D (ADR 0008/0010) la cobertura se representaba pintando cada
punto de localidad con un estado de color (rojo = cubierta por la solución,
naranja = alcanzable por alguna candidata). Se pidió representar en su lugar
**el rango de las antenas**: la zona que cada antena alcanza, sobre el
relieve y en 3D, en vez de círculos rojos por localidad.

La práctica estándar de visualización RF apoya ese cambio con dos patrones:
la huella de cobertura drapeada sobre el terreno (MATLAB Site Viewer
"coverage map" sobre relieve; TVFool superpone su mapa sobre el terreno) y
los anillos de alcance por sitio; el volumen 3D (domo) es la convención de
los visores de RAN (NVIDIA AODT sobre CesiumJS; visualizadores ADS-B de
alcance como volumen). Ninguno exige recalcular propagación en el visor.

## Decisión

- **`candidates.geojson` exporta `radius_m`** (`src/visualization/map.py`,
  llamado desde `pipeline.py` con `default_radius_m=max_distance_m`): el
  rango efectivo ρ(a) de cada candidato — radio por clase de potencia, y
  `None → max_distance_m` cuando no hay clases declaradas, la misma
  resolución que aplica `compute_coverage`. Es un dato de entrada (asignado
  por `asignar_radios`), no un resultado del motor.
- **El visor dibuja rangos, no estados por punto** (`terrain-view.js`):
  - Paso 2 (cobertura posible): **anillos de rango** ρ(a) drapeados al
    relieve — disco de relleno muy tenue + borde — para las candidatas que
    alcanzan al menos una localidad por distancia y LOS ya calculados
    (claves con elementos en `coverage`).
  - Paso 3 (solución): sólo las antenas elegidas, con relleno y borde más
    fuertes y un **domo translúcido** (media esfera de radio ρ(a) a escala
    real, apoyada en el terreno) como representación volumétrica del
    alcance.
  - Los puntos de localidad pasan a **marcador neutro** (∝ √población): el
    estado de cobertura lo transmiten los rangos; el borde de localidad
    cubierta (unión LOS de la solución) conserva su resaltado.
- **Geometría**: círculo geodésico local (Δlat constante, Δlon corregido por
  cos(latitud), como `turf.circle`) de 96 segmentos, recortado a la ventana
  del DEM con Sutherland–Hodgman para no dibujar fuera del área modelada;
  denso según la celda del DEM (mismo `densify` que bordes y enlaces). El
  domo no se recorta: es volumen, no huella.
- **Semántica honesta**: el disco es el rango nominal de la antena, no una
  certificación de cobertura radioeléctrica (ADR 0005); el visor nunca
  recalcula LOS desde `terrain.json` (ADR 0003). Lo rotula la leyenda:
  "Cobertura (rango nominal ρ de antena)".
- **El ejemplo didáctico SVG conserva su representación esquemática** (aristas
  punteadas y puntos por estado; no tiene radios reales). Los textos del
  recorrido tienen variante por vista (`terrainCopy`): disco/domo en 3D,
  puntos en el diagrama.

## Consecuencias

- Los pilotos anteriores sin `radius_m` en `candidates.geojson` fallan con
  mensaje claro ("regenera el piloto"): el visor exige el campo.
- Transparencia apilada: 25 rangos en la ventana de Yumbel obligan a relleno
  tenue (0,06 candidatas / 0,18 solución); la forma la lleva el borde.
- El domo de 30 km dentro de la ventana de 50 km de Yumbel es grande por
  honesto; se dibuja a opacidad muy baja (0,055) para no tapar el relieve.
- El rango dibujado puede incluir zonas sin LOS: es el límite de distancia
  ρ(a), no la unión C(a); para eso está el resaltado de localidades cubiertas.

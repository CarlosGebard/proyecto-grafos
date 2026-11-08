# ADR 0013: Relieve ×2,5 y torre de antena a escala (revisa ADR 0009 y ADR 0012)

## Contexto

Verificación visual de los tres pilotos (corridas de noviembre 2026): con el
relieve a escala real (×1, decisión de ADR 0009) el desnivel apenas se
percibe — la ventana regional achata la vertical — y la referencia visual
lo empeoraba: la altura simbólica fija de la torre (`ANTENNA_HEIGHT =
0,05` unidades ≈ 2 % del span) equivale a 570 m en Biobío, 566 m en
Metropolitana y **1.253 m en Yumbel**, donde el desnivel total real es de
485 m: la "torre" medía más que todos los cerros de la ventana, y el
relieve leía como plano a su lado.

Mediciones sobre `terrain.json` (span = lado mayor de `bounds_metric_m`):

| Piloto | Span | Desnivel real | Amplitud en escena ×1 | Torre simbólica (0,05 u) |
|---|---|---|---|---|
| Biobío | 22,8 km | 294 m | 0,026 u | 570 m |
| Metropolitana | 22,7 km | 738 m | 0,065 u | 566 m |
| Yumbel | 50,1 km | 485 m | 0,019 u | 1.253 m |

## Decisión

- **Exageración vertical moderada ×2,5** (`VERTICAL_EXAGGERATION` en
  `terrain-view.js`): la misma convención ya adoptada por el hillshade del
  mapa PNG (`relief.py`, "2,5× es la práctica habitual para realzar
  pendientes suaves"). No es un control configurable (se mantiene la
  decisión de ADR 0009 de eliminar el ajuste ×5–×40): una constante única,
  declarada, igual en 2D y 3D. Con ×2,5 las amplitudes suben a 0,065 /
  0,163 / 0,048 unidades — legibles sin deformar la forma del terreno.
- **Torre a escala real**: las dimensiones del glifo dejan de ser unidades
  de escena fijas y pasan a ser **metros de una torre de referencia de
  30 m** (el umbral LGUC 116 bis F que exige recepción municipal; ADR 0012
  ya la usaba como referencia) convertidos con la MISMA escala vertical de
  la escena — incluida su exageración ×2,5, para que torre y relieve
  compartan eje. Proporciones de ADR 0012 intactas (patas 2,1 m
  semi-base, crucetas 1,68 m, baliza 2,28 m). Los enlaces LOS parten de la
  punta real (30 m) y siguen drapeados al relieve.
- **Sin regenerar pilotos**: `terrain.json` no cambia; el factor es una
  decisión de presentación del visor.

## Consecuencias

- El relieve de los tres pilotos se percibe: el desnivel deja de leerse
  como plano y las elevaciones guían la vista como en el mapa PNG.
- A vista regional la torre es un tic de píxel y pico (30–75 m
  equivalentes); el zoom la revela completa. Es el costo honesto de la
  escala: la ubicación de las candidatas a vista regional la transmiten el
  paso 1 del recorrido y los anillos de rango (paso 2), no la altura del
  símbolo. La nota de la leyenda lo declara ("Relieve ×2,5 · Torre 30 m a
  escala").
- Los puntos de localidad (∝ √población) siguen siendo símbolos
  proporcionales, no volúmenes a escala: sin cambio de ADR 0009.

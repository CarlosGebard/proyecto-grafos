# ADR 0012: Representación realista de antenas (revisa ADR 0011)

## Contexto

El visor 3D dibujaba las antenas como conos macizos (`ConeGeometry` de 0,02
de radio y 0,06 de alto; a la escala real de la ventana equivalen a conos de
varios kilómetros de alto y ancho) y, en la solución, un domo translúcido de
radio ρ(a) sobre cada elegida (ADR 0011). La representación engaña por
doble partida: una antena real es una torre esbelta de decenas de metros
(LGUC art. 116 bis F: torres > 12 m requieren recepción municipal), no un
volumen de kilómetros, y la señal no alcanza altura ρ(a) — el domo sugería
un alcance vertical que no existe y leía como estructura masiva. ADR 0011 ya
reconocía el problema ("el domo de 30 km es grande por honesto"); la
revisión elimina el volumen y conserva la huella, que es la representación
estándar de los mapas de cobertura RF (MATLAB Site Viewer, TVFool).

## Decisión

- **Marcador de antena** (`terrain-view.js`, `antennaGlyph`): torre de
  telecomunicaciones dibujada con segmentos de línea — cuerpo en retícula
  (dos patas convergentes con travesaños, proporción de torre real ≈ 14:1),
  crucetas donde montan los paneles sectoriales, mástil superior y baliza de
  punta (esfera pequeña: la cabeza de la antena, que mantiene el marcador
  visible a escala regional). Es un símbolo cartográfico: proporciones de
  torre real, altura del símbolo exagerada para verse a escala regional —
  jamás un volumen masivo.
- **Sin domo**: la cobertura es la huella drapeada (anillo + disco de
  radio ρ(a), decisión de ADR 0011 que sigue vigente), con su semántica
  honesta de rango nominal, no certificación (ADR 0005). El volumen se
  elimina, no se atenúa: cualquier hemisferio de radio ρ(a) informa una
  altitud de alcance que la señal no tiene.
- **Enlaces LOS** entre elegidas parten de la punta del mástil (antes
  flotaban sobre la punta del cono).
- **Leyenda y recorrido**: el panel de cobertura muestra "Rango ρ(a)" y
  "Borde drapeado" (desaparece el swatch "Alcance 3D" del domo); el texto
  del paso "Solución conectada" describe anillo + disco drapeados.
- **El ejemplo didáctico SVG conserva su representación esquemática** (igual
  que en ADR 0011).

## Consecuencias

- La escena pierde el volumen translúcido; el estado "cubierta" lo siguen
  transmitiendo el resaltado de bordes de localidad y los rangos drapeados.
- Los marcadores dejan de ser "placeholders genéricos": son torres con
  proporciones reales; los enlaces siguen siendo segmentos drapeados simples.
- Regenerar pilotos no es necesario: el cambio es sólo de presentación y no
  toca `terrain.json`, `candidates.geojson` ni el motor.

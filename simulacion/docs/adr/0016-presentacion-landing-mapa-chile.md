# ADR 0016: Presentación en tres vistas — inicio, mapa de Chile y simulación

Fecha: 18 de noviembre de 2026.
Revisa: amplía la capa de presentación de ADR 0008/0010 (no cambia el motor
ni el pipeline). Convive con ADR 0014/0015 sin modificaciones.

## Contexto

El visor era una página única con pestañas (Yumbel / Biobío /
Metropolitana / ejemplo didáctico) más secciones explicativas debajo. Para
la entrega se pidió una presentación con narrativa:

1. **Página principal** que presente el problema y la solución, con botón
   hacia las simulaciones.
2. **Mapa completo de Chile** con puntos brillantes por cada localidad
   simulada; al hacer clic, una **carta vertical desde la derecha** con el
   impacto social del territorio (historia de su acceso a conectividad,
   segmento socioeconómico, situación actual, impacto esperado) y un botón
   que dispara **zoom animado** a la zona y abre la simulación.
3. **Simulación** con controles arriba a la izquierda (nombre, zoom,
   iniciar, reiniciar, restricciones) y leyenda abajo a la izquierda.

Además, el contenido social debía apoyarse en investigación real y
verificable, no en texto genérico.

## Decisión

- **Una sola página estática con tres vistas** (`#view-inicio`,
  `#view-mapa`, `#view-sim`) conmutadas por JS; sin build ni red (ADR 0008
  se mantiene: three.js vendido, todo el resto son assets locales). El
  archivo `index.html` sigue siendo la entrada única.
- **Mapa de Chile propio**, sin librería de mapas ni teselas: contorno
  continental simplificado vendido en `assets/chile.json` (Natural Earth
  1:50m, dominio público, simplificación con shapely, 31 KB) proyectado con
  equirectangular de paralelo estándar 36° S calculada en runtime
  (`map.js`). El zoom a una zona anima el `viewBox` del SVG con easing
  cúbico (~1,5 s) mientras los marcadores HTML se re-proyectan por
  fotograma (respetando el letterboxing de `preserveAspectRatio`).
- **Los puntos son las localidades reales**: `assets/localities.json` (19
  KB) se genera de los `demand_points.geojson` versionados de los tres
  pilotos — 827 puntos `[lon, lat, población]` — con halo + núcleo ∝
  √población. Cada punto (y el marcador de zona) abre la carta de su
  simulación.
- **Carta de impacto social** (`zones.js`): historia del territorio en
  relación con su conectividad, quién habita la zona, situación actual e
  impacto proyectado, con **fuentes citadas** (BCN/Censo 2017, PLADECO/PMC
  municipales, Archivo Histórico de Concepción, Consejo de Monumentos
  Nacionales, SUBTEL, Fundación País Digital «Hogares Conectados 2026»,
  prensa regional). Los **números de cobertura no van escritos en la
  carta**: se leen de `metrics.json` de la corrida versionada al abrirla
  (chips «26.254 de 28.337 hab (92,6 %)…»), igual que la landing calcula
  sus totales (827 localidades, 64.494 hab) desde los mismos artefactos.
  Nada se duplica: lo que la carta dice es lo que el visor muestra.
- **Controles de la simulación según lo pedido**: cluster superior
  izquierdo (volver al mapa, nombre, subtítulo/estado, zoom `−`/`+`,
  «Iniciar simulación»/«Pausar», «Reiniciar» — paso 0 **y** cámara al
  encuadre inicial —, «Restricciones»); leyenda inferior izquierda; el
  recorrido de pasos (narrativa por fase) pasa a la esquina inferior
  derecha.
- **El ejemplo didáctico SVG se elimina** junto con pestañas y el render
  2D (`render()`, capas SVG de PRC/anillos, `.legend` de demo): los tres
  pilotos tienen `terrain.json`, así que la vista siempre es 3D; si un
  piloto no la tiene, el estado avisa «regenera el piloto». La carta de
  restricciones (ADR 0015) y el recorrido de fases se conservan intactos.

## Contenido verificado (noviembre 2026)

- Nacional: brecha urbano-rural de acceso pagado cayó de ~30 p.p. (2008) a
  1,6 p.p. (2025): rural 95,1 % vs urbano 96,8 %; 196.156 hogares (3,4 %)
  siguen desconectados y el perfil mayoritario del hogar desconectado es
  rural o urbano-rural, segmento E, básica incompleta (47,3 % de ese grupo
  rural) — Fundación País Digital «Hogares Conectados 2026» (Casen 2024 +
  encuesta SUBTEL). El 95,1 % de las conexiones fijas está en zonas
  urbanas y 4,9 % en rurales (SUBTEL, informe junio 2026). 366 localidades
  obligatorias del proyecto 5G ya autorizadas (WOM, marzo 2026).
- Yumbel: 21.198 hab (Censo 2017), ~mitad rural; fuerte de 1585; santuario
  de San Sebastián (1856–1859) con ~1 millón de peregrinos entre el 20 de
  enero y el 20 de marzo; ferrocarril de 1870 masificó la fiesta; Guayacán
  Zona Típica e iglesia Monumento Histórico.
- Laja (piloto Biobío): 22.389 hab, 27,5 % rural; ferrocarril San
  Rosendo–Angol (1871), planta CMPC (1954); 3 trabajadores formales en
  información y comunicaciones (SII 2018); Saltos del Laja ZOIT; incendios
  2026: ocupación −55 % (febrero), visitas −90 % (julio).
- Buin–Paine (piloto RM): Buin 96.614 → 116.969 hab (2017→2024, +21,1 %);
  CASEN 2022: 4,4 % pobreza por ingresos, 19,1 % multidimensional; 62 %
  microempresas; comercio/manufactura/agro 23/21/20 % del empleo.

Nota: los porcentajes de cobertura de Biobío (71,7 %) y Yumbel (30,4 %)
que muestra la presentación corresponden a las corridas versionadas de
noviembre (DEM Copernicus, ver NOTA-ESTADO), no a los valores de ADR 0007
(DEM ALOS): la landing y las cartas leen `metrics.json` en runtime, así que
siempre reflejan exactamente lo que el visor carga.

## Consecuencias

- Sin dependencias nuevas: mapa propio en SVG estándar.
- El punto de entrada didáctico del diagrama SVG desaparece; la explicación
  del problema vive en la página de inicio y la del algoritmo en el
  recorrido bajo el lienzo.
- Añadir un piloto nuevo = regenerar artefactos + añadir entrada en
  `zones.js` + regenerar `assets/localities.json` (los puntos salen de los
  `demand_points.geojson`).

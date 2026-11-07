# ADR 0009: Densidad por coropletas sobre el terreno; relieve a escala real

## Contexto

Revisión visual del visor 3D (rama `presentacion-web`): (1) el relieve se
mostraba con exageración vertical configurable (×5–×40), perdiendo fidelidad
con la realidad; (2) la subdivisión territorial (localidades) flotaba sobre el
terreno como capa translúcida separada; (3) la segunda dimensión de datos —
densidad de población — necesitaba una representación fundamentada en la
literatura cartográfica.

## Decisión

- El relieve 3D se muestra a **escala real (×1)**: la vertical usa la misma
  conversión metros→unidades que la horizontal; se elimina el control de
  exageración. La topografía la transmiten la geometría y el sombreado; la
  paleta del relieve sigue siendo la tinta hipsométrica cross-blended
  (Patterson & Jenny 2011), ya adoptada en ADR 0008 y el plan.
- La subdivisión territorial se integra **al terreno como una misma
  dimensión**: rellenos a ras de superficie con material Lambert (misma
  iluminación que el relieve) y desplazamientos de drapeado ≤ 0,0006 unidades
  (metros reales, no visibles como capa flotante).
- La densidad se representa con **coropletas clasificadas por cuantiles
  (5 clases, hab/km²)**. Fundamento: las coropletas son el símbolo indicado
  para tasas normalizadas, no para conteos brutos (Slocum et al.,
  *Thematic Cartography and Geovisualization*; PSU GEOG 486); los cuantiles
  rinden mejor en tareas de lectura con distribuciones sesgadas de población
  (Brewer & Pickle 2002, *Annals of the AAG* 92(4):662-681). El esquema de
  color es secuencial multimatiz tipo ColorBrewer (Harrower et al. 2003),
  compartido entre visor 3D (`populationColor`) y mapa PNG (`DENSITY_STOPS`).
  El conteo bruto queda en símbolos proporcionales (punto ∝ √población).
- El mapa PNG también pasa a coropletico de densidad: área calculada en CRS
  métrico; localidades sin polígono quedan como puntos sin relleno.
- Refinamiento futuro declarado: mapeo dasimétrico (requiere datos auxiliares
  de ocupación del suelo; las unidades censales no son densidades reales).

## Consecuencias

- Con relieve real, una ventana de 50 km con ~500 m de desnivel se ve casi
  plana: es la fidelidad pedida; la lectura la cargan el sombreado y las
  coropletas.
- La leyenda de densidad muestra un bandín de clases con rangos hab/km²
  (tooltip por clase).
- La rampa de densidad vive en dos lugares (`populationColor` en el visor,
  `DENSITY_STOPS` en `map.py`): cambiar una exige cambiar la otra.

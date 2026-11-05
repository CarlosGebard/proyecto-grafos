# Documento explicativo del proyecto

Este documento explica, en lenguaje directo, qué problema aborda el proyecto, qué información utiliza y cómo se transforma esa información en una selección de ubicaciones para antenas. Distingue entre la simulación ya implementada y los insumos previstos para la versión final, para no presentar como hecho algo que todavía está planificado.

## 1. Problema, datos y solución propuesta

### 1.1 El problema

El proyecto busca apoyar la planificación inicial de conectividad en zonas rurales. La pregunta que responde es sencilla:

> Si sólo se pueden instalar hasta `k` antenas, ¿en cuáles ubicaciones conviene instalarlas para cubrir la mayor cantidad posible de población?

No se está diseñando todavía una red comercial ni autorizando la construcción de torres. Se trata de una herramienta de **prefactibilidad**: compara alternativas territoriales antes de invertir en estudios de terreno, permisos y diseño radioeléctrico detallado.

Para responder la pregunta se consideran tres elementos:

1. Las localidades y la población asociada a cada una.
2. Las ubicaciones posibles donde podría evaluarse una antena.
3. La posibilidad geométrica de que una ubicación cubra una localidad, según distancia y relieve.

Una localidad puede ser alcanzada desde más de una antena, pero su población se cuenta una sola vez. Por eso, una solución no se evalúa por la cantidad de antenas ni por la cantidad de enlaces, sino por la **población única cubierta**.

### 1.2 Los datos

El proyecto trabaja con capas geográficas. Cada una responde una pregunta distinta.

| Dato | Para qué se usa | Estado en la simulación V1 |
| --- | --- | --- |
| Localidades y población | Define los puntos o áreas que se desea cubrir y el peso de cada una. | Se usa la base de localidades de SUBDERE, basada en Censo 2017. |
| Censo 2024 del INE | Debe ser la fuente de población y cartografía para la versión final de la propuesta. | Planificado; todavía no reemplaza la base usada por el código actual. |
| Modelo digital de elevación (DEM) | Describe el relieve y permite revisar si una loma bloquea la visión entre una antena y una localidad. | Implementado con ALOS PALSAR para el piloto de Biobío y Copernicus GLO-30 como alternativa. |
| Área de estudio | Limita la simulación a una ventana o polígono concreto. | Implementado mediante `bbox` o un polígono provisto por el usuario. |
| Plan Regulador Comunal (PRC) | Restringe zonas inequívocas como agua, áreas verdes, drenajes e inundación/riesgo. | Implementado como *screening* territorial en Yumbel 50 km; no declara permiso de construcción. |

La simulación actual no afirma que los lugares seleccionados sean construibles. El DEM sólo ayuda a revisar el relieve; no incorpora propiedad del suelo, energía, caminos, permisos, edificios, vegetación, capacidad ni calidad de servicio.

### 1.3 De los datos al grafo

La información geográfica se convierte en un grafo bipartito, es decir, un grafo con dos tipos de nodos:

- Un conjunto de **candidatos**: ubicaciones donde se podría instalar una antena.
- Un conjunto de **localidades**: lugares cuya población se desea cubrir.

Se dibuja una arista entre un candidato y una localidad sólo cuando ambos cumplen las reglas de cobertura. En la simulación V1, esas reglas son:

1. La distancia debe ser menor o igual a la distancia máxima configurada.
2. La línea de vista entre ambos no debe estar bloqueada por el relieve muestreado en el DEM.

Los candidatos se generan como una grilla regular dentro del área de estudio. Se descartan los puntos fuera del polígono o sobre celdas sin elevación válida. En la corrida Yumbel 50 km se excluyen además las restricciones PRC inequívocas. Como su ordenanza no nombra de forma explícita la infraestructura de telecomunicaciones, las demás zonas quedan “sin clasificación”; sólo una matriz normativa validada permitiría declararlas admisibles.

### 1.4 La solución propuesta

Una solución se representa por un conjunto `S`: las ubicaciones de antenas que se decide seleccionar. Si `A` es el conjunto de candidatos disponibles, la regla es:

```text
S está contenido en A
S tiene a lo más k antenas
```

Cada candidato `a` cubre un conjunto de localidades `C(a)`. El valor de una solución es la suma de la población de todas las localidades cubiertas por al menos una de sus antenas:

```text
f(S) = suma de la población de las localidades en la unión de C(a), para cada a en S
```

La palabra “unión” es importante: si dos antenas cubren la misma localidad, sus habitantes no se suman dos veces.

La solución principal elegida para el proyecto es la **enumeración exacta**. El algoritmo genera todas las combinaciones admisibles de hasta `k` candidatos, calcula la población única cubierta por cada combinación y conserva la mejor. Por ejemplo, con cuatro candidatos y un máximo de dos antenas, compara cada pareja posible y devuelve la pareja que cubre más población.

La simulación también calcula una variante conectada. En ella se construye un segundo grafo: sus nodos son los candidatos y una arista indica que dos antenas tienen distancia admisible y línea de vista entre sí. Una selección conectada es válida sólo si todas sus antenas forman un único grupo en ese segundo grafo. No se incorpora todavía un gateway ni acceso a Internet.

Como revisa todas las alternativas permitidas, el resultado es óptimo para esa instancia. El costo es que el número de combinaciones crece rápidamente cuando hay muchos candidatos. Por esa razón la simulación fija un límite de combinaciones y trabaja con áreas piloto acotadas.

La enumeración exacta es el único método de resolución utilizado en esta versión. La versión libre evalúa combinaciones de tamaño `k`; la conectada evalúa tamaños de uno a `k`, porque no siempre es posible ampliar una red conectada sin romper esa condición. Si una instancia supera el límite de combinaciones configurado, la ejecución se detiene y se debe reducir el área de estudio o el conjunto de candidatos.

### 1.5 Qué entrega una ejecución

Al finalizar, la simulación guarda:

- El grafo de cobertura construido.
- El grafo de enlaces LOS entre antenas.
- Las antenas elegidas por los algoritmos exacto libre y conectado.
- Población cubierta, porcentaje y tiempo de ejecución de ambas soluciones.
- Un mapa, capas geográficas y un manifiesto con parámetros, fuentes y huellas de los archivos usados.

#### Generación del mapa

El mapa se genera al finalizar el pipeline a partir de las localidades, los candidatos y la solución exacta obtenida para la instancia. Primero se cargan las geometrías de las localidades y su población, y se reproyectan junto con el área de estudio a un sistema UTM para que distancias, grilla y perfiles de elevación se trabajen en metros. Luego se genera una grilla regular de candidatos dentro del área y se eliminan los puntos fuera del polígono o sobre celdas del DEM sin elevación válida. Para cada par candidato-localidad se verifica que la distancia no exceda el umbral y que el perfil de terreno no interrumpa la línea de vista; los pares que cumplen ambas condiciones forman las aristas del grafo. Tras resolver el problema por enumeración exacta, el mapa muestra los polígonos de localidad coloreados según población, identifica con un contorno y un punto las localidades cubiertas, representa todos los candidatos con una cruz y destaca con una estrella las ubicaciones seleccionadas. Además de `map.png`, se exportan `demand.geojson`, `demand_points.geojson`, `candidates.geojson` y `study_area.geojson` para revisar el resultado en un sistema de información geográfica.

Estos resultados permiten explicar por qué se escogió una alternativa y repetir el experimento con los mismos parámetros. No constituyen una certificación de cobertura radioeléctrica ni una autorización de instalación.

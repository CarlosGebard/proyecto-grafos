# Propuesta final: Optimización de Cobertura Territorial mediante Grafos

## Clasificación

Documentación y modelamiento algorítmico.

## Objetivo

Completar la propuesta de primera entrega en LaTeX para que responda íntegramente a la rúbrica: usuario, problema, objetivos y modelo con alternativas de resolución justificadas.

## Alcance

- Reescribir `informe/propuesta-1.tex` a partir de la propuesta inicial, la rúbrica y los apuntes entregados.
- Mantener el problema como planificación de cobertura territorial inalámbrica, sin asociarlo a televisión.
- Compilar el PDF final en `entregables/` y revisar sus páginas renderizadas.

## Supuestos

- El usuario es una unidad pública o territorial que planifica la expansión de conectividad en localidades rurales; es un usuario tipo, no una institución contratante específica.
- La primera entrega plantea y justifica el método; no certifica cobertura radioeléctrica ni aprueba instalaciones reales.

## Pasos

1. Traducir cada criterio de la rúbrica en una sección verificable del informe.
2. Definir el usuario, su situación actual y las dimensiones del problema con fuentes públicas y datos requeridos.
3. Formular Maximum Coverage ponderado sobre un grafo bipartito y comparar enumeración exacta, Greedy y programación entera.
4. Añadir objetivos medibles, supuestos, limitaciones, plan de evaluación y referencias.
5. Compilar, revisar el texto extraído y renderizar el PDF para control visual.

## Validación

- Compilación de `pdflatex` sin referencias, citas ni rutas rotas.
- Revisión de que el índice, ecuaciones, tablas, fuentes y saltos de página sean legibles.
- Confirmar presencia explícita de los cuatro criterios de contenido de la rúbrica.

## Riesgos

- Los datos de población son una base censal de referencia y no reemplazan un levantamiento actualizado.
- La visibilidad por línea de vista y un DEM simplifican la propagación radioeléctrica; la propuesta debe declararlo con claridad.

## Estado y evidencia

Completado. Se reescribió `informe/propuesta-1.tex` con portada, índice, resumen, usuario y situación actual, definición y dimensiones del problema, supuestos, objetivos, datos, formulación, alternativas, evaluación, riesgos, conclusión y seis referencias. Se incorporaron los recursos institucionales suministrados (`imagen.png` y `logo.png`) en la portada. La compilación mediante dos pasadas de `pdflatex` generó `entregables/propuesta-1.pdf` (ocho páginas totales: portada, índice y seis páginas de contenido). Se revisaron visualmente portada, contenido y referencias tras renderizar las páginas; no se observaron recortes ni superposiciones. La paleta propia del documento usa gris azulado; el rojo se conserva únicamente dentro del logotipo oficial provisto.

Actualización final: se separaron las secciones principales de Usuario y Problema; a continuación se introdujo la Propuesta de solución. La metodología elegida es enumeración exacta, no Greedy. Se añadió el Plan Regulador Comunal como insumo y filtro previo de candidatos, con una referencia de MINVU, controles de vigencia y una advertencia de que no reemplaza permisos ni la revisión formal. El PDF actualizado tiene nueve páginas y se recompiló en dos pasadas sin errores ni referencias pendientes; el diagrama y las secciones reorganizadas fueron revisados visualmente.

Refuerzo del modelo: la Propuesta de solución ahora concentra objetivo central, datos, preprocesamiento PRC, grafo factible, formulación binaria, algoritmo exacto por enumeración, complejidad, trazabilidad y, al final, supuestos y límites. La formulación define conjuntos, variables binarias, objetivo y restricciones que registran cobertura si y sólo si existe una arista desde un candidato seleccionado. La versión final se compiló en dos pasadas sin errores ni referencias pendientes.

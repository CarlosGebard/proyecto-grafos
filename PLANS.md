# Plan de organización del repositorio

## Objetivo

Presentar la propuesta académica y la simulación como un único repositorio fácil de recorrer y ejecutar.

## Alcance

- Mantener los directorios existentes y sus rutas internas.
- Centralizar la entrada, el estado del trabajo y los comandos de simulación en la raíz.
- Preparar reglas de Git para no versionar entornos, cachés ni resultados reproducibles.

## Supuestos

- La propuesta y la simulación son partes del mismo proyecto y deben permanecer separadas por responsabilidad.
- Los resultados presentes en `simulacion/outputs/` son evidencia local reproducible, no archivos que deban versionarse.

## Pasos

1. Actualizar el README raíz como portada única del proyecto.
2. Crear un estado breve con evidencia de los dos pilotos disponibles y sus límites conocidos.
3. Ajustar la documentación de la propuesta para que apunte a la simulación dentro de este repositorio.
4. Añadir un `.gitignore` raíz para los artefactos locales comunes.

## Validación

- Comprobar todos los enlaces y rutas locales del README y del estado.
- Ejecutar las pruebas y comprobaciones estáticas existentes desde `simulacion/`.

## Riesgos

La simulación requiere datos geoespaciales locales y puede tardar según el área de estudio; esta organización no cambia el modelo ni sus resultados.

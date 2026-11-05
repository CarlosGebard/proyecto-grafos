# ADR 0005: PRC como filtro territorial de tres estados

## Contexto

Los mapas PRC disponibles declaran zonificación y usos, pero Yumbel no menciona explícitamente infraestructura de telecomunicaciones. Tratar la ausencia de restricción como permiso produciría una afirmación legal falsa.

## Decisión

La primera corrida de 50 km usa modo `screening`: excluye sólo agua, áreas verdes, drenajes e inundación/riesgo identificables en los polígonos PRC. El resto queda `unknown` y se conserva para la simulación, con procedencia visible. El modo `strict` no incorpora candidatos `unknown` y requiere una matriz normativa aprobada de zonas `allow`.

## Consecuencias

La simulación muestra restricciones territoriales verificables sin afirmar autorización municipal. La salida incluye `constraints.geojson`, estado por candidato y auditoría en el manifiesto.

# ADR 0002: Cobertura máxima con conectividad entre antenas

## Contexto

El modelo V1 selecciona hasta `k` candidatos que cubren máxima población, pero permite antenas aisladas. La evolución acordada exige que las antenas seleccionadas formen un único grupo conectado mediante enlaces de línea de vista. No se modela aún una salida a Internet ni un gateway.

## Decisión

Se construyó un segundo grafo no dirigido cuyos nodos son candidatos. Una arista existe si ambos candidatos están dentro de `max_distance_m` —o del mínimo de los radios efectivos por clase de potencia— y tienen LOS sobre el DEM, usando `antenna_height_m` en ambos extremos. Se conservará el grafo bipartito de cobertura.

La solución conectada ya no descarta combinaciones con BFS: la enumera canónicamente con **ESU** (subconjuntos conexos ≤ k, cada uno exactamente una vez; ADR 0006) y maximiza población única cubierta con el mismo motor exacto de la variante libre. Se exportarán `graph.json`, `connectivity.json` y métricas separadas para cobertura libre, conectada y baseline goloso.

## Consecuencias

- La comparación muestra el costo de imponer una red conectada.
- La enumeración requiere más combinaciones que la versión libre y conserva el límite configurado.
- El modelo sigue siendo una aproximación de prefactibilidad: no prueba factibilidad radioeléctrica, capacidad, costos ni acceso a Internet.

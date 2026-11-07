# Algoritmo de cobertura máxima conectada — especificación completa

Estado: implementado en `feat/algoritmo` (`src/algorithms/connected.py`). Reemplaza la enumeración por fuerza bruta que estaba en `src/algorithms/exact.py` (eliminado). Incorpora la retroalimentación del profesor (comentarios del PDF G8 y notas de WhatsApp), el modelo PartialConRBDS de [1] y los parámetros de potencia de [2].

## 1. Problema

Sea `R` el conjunto de candidatos (generado por criterio y post-filtro territorial PRC + establecimientos sensibles, ADR 0007), `D` las localidades con peso poblacional `w(d) ≥ 0`, `C(a) ⊆ D` las localidades que el candidato `a` cubre, `E_conn` los enlaces LOS entre antenas y `G_conn = (R, E_conn)`.

Cada candidato tiene un radio efectivo `ρ(a)` derivado de su clase de potencia [2]. Las aristas se definen:

```text
Cobertura:   (a, d) ∈ E_cov  ⇔  dist(a, d) ≤ ρ(a)  y LOS(a, d, h_ant, h_recv)
Enlace:      (u, v) ∈ E_conn ⇔  dist(u, v) ≤ min(ρ(u), ρ(v))  y LOS(u, v, h_ant, h_ant)
```

Dado `k`, un conjunto opcional de gateways `G ⊆ R` (antenas con salida a Internet) y un umbral opcional `t` de población, buscar `S ⊆ R` tal que:

```text
(1) |S| ≤ k
(2) G_conn[S] es conexo                          (los comentarios p4/p5: LOS entre antenas)
(3) S ∩ G ≠ ∅          si G ≠ ∅                 (comentario p4: punto de acceso a Internet)
maximizando  f(S) = Σ_{d ∈ ∪_{a∈S} C(a)} w(d)     (unión de conjuntos y luego sumar; sin duplicar)
```

Variantes que debe resolver el mismo motor:

- **(i) Optimización** (la actual): máximo `f(S)` con `|S| ≤ k`.
- **(ii) Decisión por tamaño**: mínimo `m ≤ k` con `f(S) ≥ t` para algún `S` conexo ("¿cuántas antenas para cubrir el X %?").
- **(iii) Decisión por cobertura**: ¿existe `S` con `|S| ≤ k` y `f(S) ≥ t`?
- **Libre** (sin conectividad): `G_conn` es la clique completa; mismo motor.

Empates: se elige el `S` lexicográficamente menor en tupla ordenada de identificadores (regla de reproducibilidad de la propuesta).

## 2. Posición respecto de [1]

| Elemento [1] | Decisión aquí |
| --- | --- |
| PartialConRBDS, variante (i) | Es exactamente nuestro problema; con pesos en `B` (población). [1] demuestra sus esquemas sin pesos; aquí se exige optimalidad exacta, no aproximación |
| W[1]-duro en `k`; sin (1, 1−1/e+ε) polinomial | Descarta esperar un algoritmo general rápido; hay que explotar estructura |
| Régimen `Δ(G_conn)` acotado (§1.3): enumerar sólo subconjuntos conexos, `n·Δ^O(k)`, **exacto** | **Núcleo elegido.** `Δ` queda acotado por el corte de distancia + LOS sobre el conjunto candidato; el tamaño de la instancia lo fija `max_candidates` (ADR 0007) |
| El obstáculo de aditividad (§1.2): `w(S) ≠ |N(S)|` | El motor nunca puntúa por suma por-antena: mantiene la unión incrementalmente (§4.2). Es la respuesta en código a la observación "no sólo sumar cardinalidad" |
| Máximo árbol de peso en `G_conn` (Lema 16), conflicto/esparsificación (Thm 1) | **No se implementa**: resuelven la versión aditiva-aproximada. Quedan documentados como techo teórico (§10) |

## 3. Estructuras de datos

```python
# Preproceso (una vez por instancia)
R: list[str]                 # candidatos ordenados por id (orden total reproducible)
idx: dict[str, int]          # posición en R
nbr: dict[str, list[str]]    # vecinos en G_conn, ordenados por idx
cov: dict[str, list[str]]    # C(a) ordenada por id
w: dict[str, float]          # población por localidad
cover: dict[str, int]        # contador: cuántas antenas de S cubren d (mutable, con traza)
prefix: list[float]          # prefix[m] = suma de los m mayores Σ_{d∈C(a)} w[d], m = 0..k
```

`prefix` es una **cota estática**: si a `S` le quedan `m` incorporaciones, el incremento de `f` es a lo sumo la suma de los `m` mayores pesos totales por candidato (los solapes sólo reducen). Válida siempre, barata (O(1) por nodo).

Estado incremental del objetivo (la "unión y luego sumar" del profesor, en O(1) amortizado por localidad):

```python
def aplicar(a, traza):            # entra a en S
    for d in cov[a]:
        if cover[d] == 0:
            f += w[d]
            traza.append(d)       # recordatorio para deshacer exactamente estos
        cover[d] += 1

def deshacer(a, traza):
    for d in traza.pop():         # sólo las localidades que a estrenó
        cover[d] = 0
    for d in cov[a]:
        cover[d] -= 1
```

Costo por nodo: `O(Δ̄ + |C(a)|)`; memoria `O(|R| + |D|)` con recursión de profundidad `k`.

## 4. Algoritmos

### 4.1 Núcleo: enumeración canónica de subconjuntos conexos (ESU)

Esqueleto de **ESU** (Wernicke 2006, [3]): cada subconjunto conexo de `G_conn` con `≤ k` vértices se genera **exactamente una vez**, bajo su vértice de identificador mínimo. Esto elimina la generación de subconjuntos desconectos y los re-chequeos BFS del placeholder (`exact_connected` viejo: `Σ_r C(n,r)` conjuntos + BFS por conjunto).

```python
def resolver(graph, conn, k, gateways=None, budget=100_000) -> Solution:
    validar(graph, conn, k, gateways, budget)     # simétrica, sin autoenlaces, G ⊆ R, etc.
    G = set(gateways) if gateways is not None else None
    best_S, best_f = (), 0.0
    evals = 0

    def evaluar():
        nonlocal best_S, best_f, evals
        evals += 1
        if evals > budget:
            raise ExactLimitExceeded(...)
        S_tuple = tuple(sorted(S))
        if G is not None and not (S_set & G):
            if len(S) == k:
                return                 # inviable y sin espacio para agregar un gateway
        else:
            # comparación estricta en f; el desempate lexicográfico exige
            # NO podar por empate de valor (ver §5, invariante I4)
            if best_f < f or (best_f == f and (best_S == () or S_tuple < best_S)):
                best_S, best_f = S_tuple, f
        if f + prefix[min(k - len(S), len(R))] < best_f:
            return                     # cota estricta: ninguna expansión supera al mejor

    def expandir(v_raiz, ext):
        evaluar()
        if len(S) == k or not ext:
            return
        for i in range(len(ext)):
            a = ext[i]
            resto = ext[i+1:]          # a y los anteriores quedan excluidos en esta rama
            S.append(a); S_set.add(a)
            traza = []; aplicar(a, traza)
            # Nexcl(a, S sin a): vecinos de a NO adyacentes a ningún vértice
            # previo de S (se compara contra N(S) antes de absorber N(a)).
            nuevos = sorted(u for u in nbr[a]
                            if idx[u] > idx[v_raiz] and u not in N(S_sin_a))
            expandir(v_raiz, resto + nuevos)
            deshacer(a, traza)
            S.pop(); S_set.remove(a)

    for raiz in R:                     # raíz = mínimo del conjunto: cada conexo una vez
        S, S_set = [raiz], {raiz}
        traza = []; aplicar(raiz, traza)
        expandir(raiz, sorted(u for u in nbr[raiz] if idx[u] > idx[raiz]))
        deshacer(raiz, traza)

    return Solution(nombre_variante, best_S, frozenset(...), best_f, elapsed)
```

Regla de extensiones (fiel a ESU, [3] Def. 3.1 y Teorema 3.4): al agregar `a`, entran sus vecinos con `id > raíz` que estén en el **vecindario exclusivo** `Nexcl(a, S) = N(a) ∖ N(S)` — adyacentes a `a` pero a **ningún** vértice previo de `S` (la comparación se hace contra `N(S)` *antes* de absorber `N(a)`). Un vértice que quedó adyacente a `S` y fue descartado **nunca re-entra**: eso, junto con la raíz = mínimo del conjunto, es lo que hace que cada conjunto conexo aparezca una sola vez ([3], prueba de E4). Nota de implementación: la versión anterior de este documento excluía sólo `resto`, lo que genera duplicados en triángulos (verificado por fuerza bruta en todos los grafos de 4 y 5 vértices).

**Variante libre**: `nbr[a] = todos los candidatos` (clique) → ESU degenera en "todos los subconjuntos con mínimo fijo"; mismo objetivo, misma cota, mismo desempate. Sin conectividad ni gateway.

### 4.2 Baseline goloso (para el contraste rápido-vs-óptimo que promete la propuesta)

```python
def greedy_conectado(graph, conn, k, gateways=None) -> Solution:
    semillas = gateways if gateways else R        # con gateway exigido, semilla ∈ G
    for s in semillas:
        S = [s]; aplicar(s)
        while len(S) < k:
            # margen(d) = w[d] si cover[d] == 0, si no 0   (lectura sin mutar)
            a* = argmax_{a ∈ ∪N(S)∖S} Σ_{d ∈ C(a)} margen(d)
            if margen(a*) == 0: break             # pesos no negativos: no hay pérdida
            S.append(a*); aplicar(a*)
        conservar el mejor (mismo desempate)
        deshacer todo
```

Costo `O(|R|·k·Δ̄·máx|C(a)|)`. Calidad medida como razón `greedy/exacto` por instancia.

### 4.3 Variante de decisión (umbral `t`)

```python
def min_antenas_para_objetivo(graph, conn, k_max, t, gateways=None, budget=...):
    for m in range(1, k_max + 1):
        sol = resolver(graph, conn, k=m, gateways, budget)   # f_max(m) es no decreciente en m
        if sol.population_covered >= t:
            return m, sol
    return None            # "k_max antenas no alcanzan t": certificado del variant (iii)
```

La monotonía de `f_max` en `m` vale aunque algún conjunto no sea extensible: se puntúa todo tamaño y el mejor de tamaño `m+1` nunca es peor que el de `m` (extender un conexo por un vecino sigue conexo; si no hay vecinos, ese conjunto ya fue superado por otro del mismo tamaño… la garantía operativa es que el motor puntúa **todos** los tamaños `≤ m`, así no depende de argumento de extensibilidad).

## 5. Correctitud

Invariantes por nodo del DFS:

- **I1 (enumeración)**: cada `S ⊆ R`, `|S| ≤ k`, conexo en `G_conn`, aparece exactamente una vez, con `min(S)` como raíz ([3], lema de ESU).
- **I2 (objetivo)**: `f = Σ_{d: cover[d] > 0} w[d]` en todo instante; la traza garantiza deshacer exactamente las localidades estrenadas por el vértice saliente (los solapes no restan).
- **I3 (cota)**: `f + prefix[·]` es mayorante del mejor completamiento: válida porque el aporte de cualquier candidato nuevo es `≤` su peso total.
- **I4 (desempate)**: la poda usa comparación **estricta** (`< best_f`); un completamiento que **empata** el mejor valor nunca se poda, y la comparación `(f, S_tuple)` deja el menor lexicográfico, independiente del orden de visita.
- **I5 (gateway)**: se puntúa sólo conjuntos que cumplen (3); la poda por imposibilidad se dispara cuando no hay gateway en `S` y `k − |S| = 0`.

Teorema (exactitud): el devuelto es el óptimo de §1. El óptimo es un conjunto conexo (o subconjunto cualquiera en la variante libre) de tamaño ≤ k, generado una vez por I1, puntueado bajo I5, y ningún otro conjunto lo supera porque todos son visitados y la poda I3 sólo descarta ramas mayoradas por debajo del mejor.

Complejidad. Conjuntos visitados ≤ `Σ_{r=1..k} n·(e·(Δ̄−1))^{r−1}` ([3]); cada nodo `O(Δ̄ + máx|C(a)|)` más `O(1)` de cota. Referencia numérica (Yumbel 5 km, n = 121, k = 5): `C(121,5) ≈ 1,99·10⁸` conjunto totales; el mayorante conexo con `Δ̄ = 10` da ≈ `4,5·10⁷` — y la poda I3 recorta en la práctica órdenes adicionales. La medición real (conteo de conexos y tasa de poda) es la fase 0 del plan; el presupuesto `budget` protege el peor caso con la semántica ya existente de `ExactLimitExceeded`.

## 6. Configuración (clases de potencia y radio)

```toml
# un solo radio (compatible con todo lo existente)
max_distance_m = 30000.0

# o clases por potencia → radio efectivo (referencias en docs/referencias-potencia-antenas.md)
[[antenna_class]]
name = "macro-baja-banda"   # ref. LTE 700 MHz / TVWS 42 dBm EIRP
radius_m = 30000.0
count = 3

[[antenna_class]]
name = "wisp-tvws"          # ref. 16 W EIRP rural (FCC 2020)
radius_m = 12000.0
count = 8

[[antenna_class]]
name = "wifi-5-8"           # ref. 1 W PIRE (Subtel Res. 1985)
radius_m = 6000.0
count = 10
```

- `compute_coverage` usa `ρ(a)` por candidato; `compute_connectivity` usa `min(ρ(u), ρ(v))`.
- Sin clases, `ρ(a) = max_distance_m` para todos: retrocompatible con los pilotos.
- La clase se adjunta a `AntennaCandidate` (nuevo campo `radius_m`, opcional, default del config).
- Gateway: `gateways` como lista de ids en el TOML o fracción (`gateway_fraction = 0.2` → los `count` primeros? No: los candidatos marcados; resolución de diseño en fase 2, la interfaz del motor ya lo recibe como `set[str]`).

## 7. Casos borde y semántica

| Caso | Resultado |
| --- | --- |
| `R` vacío o `k = 0` | `S = ()`, `f = 0` (como hoy) |
| `k ≥ |R|` | se enumeran todos los conexos; sin error |
| `G_conn` sin aristas | sólo singletons son factibles; el que más cubre |
| gateway exigido, ninguno alcanzable conexo | `S = ()`, `f = 0` (nótese: con `G ≠ ∅`, `()` se considera "sin solución" sólo si se puntúa; convención: se devuelve `()` con `f = 0`) |
| `gateways = set()` explícito | `ValueError` (distinguir "sin requisito" (`None`) de requisito imposible) |
| pesos en 0 | participan del conteo de cobertura, no del objetivo |
| presupuesto excedido | `ExactLimitExceeded`, mensaje con `evals > budget` (reemplaza a `max_combinations`) |

## 8. Límites del modelo de cobertura (lo que el algoritmo NO captura)

Estos límites viven en la capa geográfica (cómo se construyen `C(a)` y `E_conn`), no en el motor: el motor es agnóstico y optimiza exactamente la instancia que recibe. Se documentan para no sobreinterpretar los resultados y porque motivaron la discusión de "zona con señal pero población detrás de una loma".

- **Cobertura por pares, no por zonas.** El radio `ρ(a)` es sólo un prefiltro de distancia; dentro del disco, una localidad es arista sólo si el perfil DEM entre antena y localidad despeja. "La zona tiene señal" no existe como concepto: si hay una loma en el camino, ese par simplemente no genera arista (`has_line_of_sight` muestrea el perfil a paso ≤ medio píxel DEM precisamente para no saltarse una loma).
- **Granularidad: la localidad es UN punto interior.** Toda la población de la localidad se evalúa en su punto interior (`DemandNode.point`). Si el punto queda a la sombra de un obstáculo, la localidad completa se cuenta como no cubierta por esa antena (conservador); si el punto tiene LOS, la localidad completa cuenta, aunque residentes detrás de un cerro no tengan señal. El sombreado sub-local (personas dentro de la zona de cobertura pero detrás del obstáculo) **no se modela**: `|B|` = número de localidades. Vía de extensión si se exige más fino: varios puntos de muestreo por polígono de localidad → mismo algoritmo, sólo crece `|B|`.
- **Sin difracción ni atenuación.** Un perfil bloqueado es fallo duro de la recta geométrica entre `ground_antena + h_ant` y `ground_localidad + h_recv` (1,5 m): no hay difracción que rodee la loma, ni zona de Fresnel, ni vegetación, ni edificios, ni curvatura terrestre. Una antena tapada por el relieve no sirve "un poco": no sirve.
- **NoData nunca es cobertura.** Celdas DEM sin elevación válida ⇒ sin arista, nunca cobertura garantizada (supuesto ya declarado en la propuesta).
- **Consecuencia combinatoria.** El sombreado se manifiesta como aristas faltantes: una loma puede hacer valiosas dos antenas con discos que se solapan (una por lado). El motor captura esto automáticamente — es exactamente el tradeoff que `f(S)` optimiza — pero no "sabe" que hay una sombra: sólo ve el grafo.

## 9. Plan de pruebas y aceptación

1. **Oracle**: property test existente (oracle independiente por combinaciones) extendido a conectividad aleatoria + gateways aleatorios; igualdad de `f` y de `(S, covered)` incluido el desempate.
2. **Unicidad ESU**: en grafos aleatorios, el número de conjuntos visitados == número de subconjuntos conexos ≤ k contados por fuerza bruta con BFS (sin poda) — valida I1.
3. **Traza**: `f` incremental == recalculado desde cero en cada nodo (modo debug) — valida I2.
4. **Regresión**: Biobío 4.210 / 80,44 % y Metropolitana 25.119 / 88,64 % se reproducen exactamente, con menos evaluaciones que el placeholder.
5. **Presupuesto**: excede → `ExactLimitExceeded`.
6. **Fase 2**: clases de radio cambian `C(a)` y `G_conn` según la regla `min(ρu, ρv)`; greedy ≤ exacto siempre; `min_antenas_para_objetivo` consistente con la optimización.

## 10. Integración (fases, resumen)

0. **Medición**: `Δ̄(G_conn)`, conteo de conexos ≤ k, solapes `|C(u)∩C(v)|` en los pilotos (insumo del informe y validación del régimen). Script desechable.
1. **Motor**: `src/algorithms/connected.py` con `resolver` (optimización libre y conectada), `greedy_conectado`, `min_antenas_para_objetivo`; cutover: se elimina `exact.py`, `pipeline.py` y tests migrados, `max_evaluations` sustituye a `max_combinations`.
2. **Modelo**: clases de radio (§6), `t` de cobertura, gateways; ADR 0006 (reemplazo del algoritmo + gateway + potencia), actualización de ADR 0002, `ESTADO.md`/`NOTA-ESTADO.md`.
3. **Informe**: mapeo a PartialConRBDS (§2), techo teórico (Thm 1/2/4 de [1]), tabla greedy-vs-exacto, datos concretos de fase 0 (comentario p7 del profesor).
4. **Validación end-to-end**: `pytest`, `ruff`, corrida Yumbel con clases de potencia.

## Referencias

[1] T. Inamdar, S. Jana, M. Kundu, D. Lokshtanov, S. Saurabh, M. Zehavi. *FPT Approximations for Connected Maximum Coverage*. ITCS 2026, LIPIcs 80. DOI 10.4230/LIPIcs.ITCS.2026.80 (`docs/LIPIcs.ITCS.2026.80.pdf`).

[2] `docs/referencias-potencia-antenas.md` — potencias y radios de referencia verificados (3GPP TS 36.104, FCC TVWS, Subtel Res. 1985, backhaul PTP).

[3] S. Wernicke. *Efficient detection of network motifs*. IEEE/ACM Transactions on Computational Biology and Bioinformatics 3(4):347–359, 2006 (algoritmo ESU, enumeración de subgrafos conexos sin repetición).

[4] G. D'Angelo, E. Delfaraz. *Approximation algorithms for connected maximum coverage*. AAMAS 2025 (segunda referencia del profesor; baseline de aproximación, por leer: `10.5555/3709347.3743569`).

"""Motor exacto de cobertura máxima conectada (docs/algoritmo-conectado.md).

Reemplaza la fuerza bruta: enumera canónicamente subconjuntos conexos de
``G_conn`` (ESU, Wernicke 2006), mantiene el objetivo como unión incremental
(comentario del profesor: "no sólo sumar cardinalidad") y poda con la cota
estática de prefijos. El desempate es lexicográfico con comparación estricta:
nunca se poda por empate de valor (invariante I4 de la especificación).
"""

from collections.abc import Iterable
from math import isfinite
from time import perf_counter

from src.graph.models import CoverageGraph, Solution


class ExactLimitExceeded(ValueError):
    """Se superó el presupuesto de evaluaciones; es la protección de peor caso."""


def _validar(
    graph: CoverageGraph,
    connectivity: dict[str, set[str]] | None,
    k: int,
    gateways: Iterable[str] | None,
) -> tuple[list[str], set[str], set[str] | None]:
    graph.validate()
    if not isinstance(k, int) or isinstance(k, bool) or k < 0:
        raise ValueError("k debe ser un entero no negativo")
    antennas = sorted(graph.coverage)
    antenna_set = set(antennas)
    if connectivity is not None:
        if set(connectivity) != antenna_set:
            raise ValueError(
                "La conectividad debe incluir exactamente todos los candidatos"
            )
        if any(node in neighbors for node, neighbors in connectivity.items()):
            raise ValueError("La conectividad no puede contener autoenlaces")
        if any(not neighbors <= antenna_set for neighbors in connectivity.values()):
            raise ValueError("La conectividad contiene candidato desconocido")
        if any(
            node not in connectivity[neighbor]
            for node, neighbors in connectivity.items()
            for neighbor in neighbors
        ):
            raise ValueError("La conectividad debe ser simétrica")
    gateways_set = None
    if gateways is not None:
        gateways_set = set(gateways)
        if not gateways_set:
            raise ValueError(
                "gateways vacío: usar None si no se exige salida a Internet"
            )
        if not gateways_set <= antenna_set:
            raise ValueError("gateways contiene candidatos desconocidos")
    return antennas, antenna_set, gateways_set


def _vecinos(
    antennas: list[str],
    idx: dict[str, int],
    connectivity: dict[str, set[str]] | None,
) -> dict[str, list[str]]:
    """Listas de adyacencia ordenadas por idx; None → clique (variante libre).

    En la variante libre todas las entradas comparten la misma lista: memoria
    O(n), no O(n²).
    """
    if connectivity is None:
        return {antenna: antennas for antenna in antennas}
    return {
        antenna: sorted(connectivity[antenna], key=idx.__getitem__)
        for antenna in antennas
    }


def _aplicar(cov, w, cover, antenna: str) -> float:
    """Entra ``antenna`` a S; devuelve el incremento de f (sólo estrenos)."""
    incremento = 0.0
    for d in cov[antenna]:
        if cover[d] == 0:
            incremento += w[d]
        cover[d] += 1
    return incremento


def _deshacer(cov, w, cover, antenna: str) -> float:
    """Sale ``antenna`` de S; devuelve el decremento de f (cover llega a 0)."""
    decremento = 0.0
    for d in cov[antenna]:
        cover[d] -= 1
        if cover[d] == 0:
            decremento += w[d]
    return decremento


def _mejor(best_S, best_f, S_tuple, f):
    """Desempate lexicográfico: estricto en valor, menor tupla en empate (I4)."""
    if best_f < f or (best_f == f and (best_S == () or S_tuple < best_S)):
        return S_tuple, f
    return best_S, best_f


def resolver(
    graph: CoverageGraph,
    connectivity: dict[str, set[str]] | None,
    k: int,
    gateways: Iterable[str] | None = None,
    budget: int = 100_000,
    poda: bool = True,
    verificar: bool = False,
) -> Solution:
    """Óptimo exacto: |S| ≤ k, G_conn[S] conexo, S ∩ G ≠ ∅ si G ≠ ∅.

    ``connectivity=None`` es la variante libre: G_conn es la clique completa y
    el mismo motor, cota y desempate se aplican sin requisito de red.

    ``poda=False`` desactiva la cota (para contar subconjuntos conexos en
    pruebas); ``verificar=True`` recalcula f desde cero en cada nodo (I2).
    """
    started = perf_counter()
    if not isinstance(budget, int) or isinstance(budget, bool) or budget < 1:
        raise ValueError("budget debe ser un entero positivo")
    antennas, _, G = _validar(graph, connectivity, k, gateways)
    idx = {antenna: position for position, antenna in enumerate(antennas)}
    nbr = _vecinos(antennas, idx, connectivity)
    cov = {antenna: sorted(graph.coverage[antenna]) for antenna in antennas}
    w = graph.population
    cover = dict.fromkeys(w, 0)
    # Cota estática I3: con m incorporaciones restantes, el incremento de f es
    # a lo sumo la suma de los m mayores pesos totales por candidato.
    totales = sorted(
        (sum(w[d] for d in cov[a]) for a in antennas),
        reverse=True,
    )
    prefix = [0.0]
    for total in totales[: min(k, len(antennas))]:
        prefix.append(prefix[-1] + total)
    estado = {"f": 0.0, "evals": 0, "best_S": (), "best_f": 0.0}
    S: list[str] = []
    S_set: set[str] = set()
    alcanzados: set[str] = set()  # vértices adyacentes a alguno de S (con traza)

    def evaluar() -> None:
        estado["evals"] += 1
        if estado["evals"] > budget:
            raise ExactLimitExceeded(
                f"Presupuesto excedido: {estado['evals']} evaluaciones > budget={budget}"
            )
        if verificar:
            recalculado = sum(w[d] for d in w if cover[d] > 0)
            if recalculado != estado["f"]:
                raise RuntimeError(
                    f"Invariante I2 roto: f={estado['f']} != {recalculado}"
                )
        S_tuple = tuple(sorted(S))
        if G is not None and not S_set & G:
            if len(S) == k:
                return  # inviable y sin espacio para incorporar un gateway
        else:
            estado["best_S"], estado["best_f"] = _mejor(
                estado["best_S"], estado["best_f"], S_tuple, estado["f"]
            )
        if (
            poda
            and estado["f"] + prefix[min(k - len(S), len(prefix) - 1)]
            < estado["best_f"]
        ):
            return  # cota estricta: ninguna expansión supera al mejor

    def expandir(v_raiz: str, ext: list[str]) -> None:
        evaluar()
        if len(S) == k or not ext:
            return
        for i in range(len(ext)):
            a = ext[i]
            resto = ext[i + 1 :]  # a y los anteriores quedan excluidos en la rama
            S.append(a)
            S_set.add(a)
            # Regla ESU (Wernicke 2006, E4): candidatos = Nexcl(a, S sin a) ∩
            # {id > raíz} — vecinos de a no adyacentes a ningún vértice previo
            # de S. Se evalúa contra N(S) ANTES de absorber N(a). La unión con
            # el resto de ext es disjunta y sin re-entrada: eso garantiza que
            # cada conexo se genere una sola vez (I1).
            nuevos = [
                u
                for u in nbr[a]
                if idx[u] > idx[v_raiz] and u not in alcanzados and u not in S_set
            ]
            traza_alcanzados = [u for u in nbr[a] if u not in alcanzados]
            alcanzados.update(traza_alcanzados)
            estado["f"] += _aplicar(cov, w, cover, a)
            expandir(v_raiz, resto + nuevos)
            for u in traza_alcanzados:
                alcanzados.remove(u)
            estado["f"] -= _deshacer(cov, w, cover, a)
            S.pop()
            S_set.remove(a)

    if k > 0 and antennas:
        for raiz in antennas:  # raíz = mínimo del conjunto: cada conexo una vez
            S = [raiz]
            S_set = {raiz}
            alcanzados = set(nbr[raiz])
            estado["f"] += _aplicar(cov, w, cover, raiz)
            expandir(raiz, [u for u in nbr[raiz] if idx[u] > idx[raiz]])
            estado["f"] -= _deshacer(cov, w, cover, raiz)
    best_S = estado["best_S"]
    covered = (
        frozenset().union(*(graph.coverage[a] for a in best_S))
        if best_S
        else frozenset()
    )
    nombre = "exact" if connectivity is None else "exact_connected"
    return Solution(
        nombre,
        best_S,
        covered,
        estado["best_f"],
        perf_counter() - started,
        estado["evals"],
    )


def greedy_conectado(
    graph: CoverageGraph,
    connectivity: dict[str, set[str]] | None,
    k: int,
    gateways: Iterable[str] | None = None,
) -> Solution:
    """Baseline goloso para el contraste rápido-vs-óptimo.

    Con gateway exigido, la semilla pertenece a G; en cada paso agrega el
    vecino de S con mayor margen (peso no cubierto). Calidad ≤ exacto siempre.
    """
    started = perf_counter()
    antennas, _, G = _validar(graph, connectivity, k, gateways)
    idx = {antenna: position for position, antenna in enumerate(antennas)}
    nbr = _vecinos(antennas, idx, connectivity)
    cov = {antenna: sorted(graph.coverage[antenna]) for antenna in antennas}
    w = graph.population
    cover = dict.fromkeys(w, 0)
    if k == 0 or not antennas:
        nombre = "greedy" if connectivity is None else "greedy_connected"
        return Solution(nombre, (), frozenset(), 0.0, perf_counter() - started, 0)
    semillas = sorted(G) if G is not None else antennas
    best_S, best_f = (), 0.0
    evals = 0
    for semilla in semillas:
        S = [semilla]
        S_set = {semilla}
        f = _aplicar(cov, w, cover, semilla)
        while len(S) < k:
            frontera = sorted({u for x in S for u in nbr[x]} - S_set)
            mejor_a, mejor_ganancia = None, 0.0
            for a in frontera:
                ganancia = sum(w[d] for d in cov[a] if cover[d] == 0)
                evals += 1
                if ganancia > mejor_ganancia:  # estricto: empate → menor id
                    mejor_a, mejor_ganancia = a, ganancia
            if mejor_a is None:
                break  # margen 0: pesos no negativos, no hay pérdida
            S.append(mejor_a)
            S_set.add(mejor_a)
            f += _aplicar(cov, w, cover, mejor_a)
        if G is None or S_set & G:
            best_S, best_f = _mejor(best_S, best_f, tuple(sorted(S)), f)
        while S:
            f -= _deshacer(cov, w, cover, S.pop())
    covered = (
        frozenset().union(*(graph.coverage[a] for a in best_S))
        if best_S
        else frozenset()
    )
    nombre = "greedy" if connectivity is None else "greedy_connected"
    return Solution(nombre, best_S, covered, best_f, perf_counter() - started, evals)


def min_antenas_para_objetivo(
    graph: CoverageGraph,
    connectivity: dict[str, set[str]] | None,
    k_max: int,
    t: float,
    gateways: Iterable[str] | None = None,
    budget: int = 100_000,
) -> tuple[int, Solution] | None:
    """Variante de decisión: mínimo m ≤ k_max con f(S) ≥ t para algún S.

    Devuelve (m, solución) o None si k_max antenas no alcanzan t (certificado
    del variante iii). El motor puntúa todos los tamaños ≤ m, así que el
    resultado no depende de argumentos de extensibilidad.
    """
    if not isinstance(k_max, int) or isinstance(k_max, bool) or k_max < 0:
        raise ValueError("k_max debe ser un entero no negativo")
    if (
        not isinstance(t, (int, float))
        or isinstance(t, bool)
        or not isfinite(t)
        or t < 0
    ):
        raise ValueError("t debe ser un número finito no negativo")
    _validar(graph, connectivity, k_max, gateways)
    for m in range(1, k_max + 1):
        solucion = resolver(graph, connectivity, m, gateways=gateways, budget=budget)
        if solucion.population_covered >= t:
            return m, solucion
    return None

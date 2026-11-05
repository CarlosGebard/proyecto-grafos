from itertools import combinations
from math import comb
from time import perf_counter

from src.graph.models import CoverageGraph, Solution


class ExactLimitExceeded(ValueError):
    pass


def exact(graph: CoverageGraph, k: int, max_combinations: int = 100_000) -> Solution:
    started = perf_counter()
    graph.validate()
    if not isinstance(k, int) or isinstance(k, bool) or k < 0:
        raise ValueError("k debe ser un entero no negativo")
    if max_combinations < 1:
        raise ValueError("max_combinations debe ser positivo")
    antennas = sorted(graph.coverage)
    size = min(k, len(antennas))
    count = comb(len(antennas), size)
    if count > max_combinations:
        raise ExactLimitExceeded(
            f"Exacto omitido: C({len(antennas)},{size})={count} > {max_combinations}"
        )
    best, covered_best, score = (), set(), 0.0
    # Pesos no negativos: un óptimo de hasta k puede extenderse a min(k,n).
    for selected in combinations(antennas, size):
        covered = set().union(*(graph.coverage[a] for a in selected))
        weight = graph.weight(covered)
        if weight > score:
            best, covered_best, score = selected, covered, weight
    return Solution(
        "exact", best, frozenset(covered_best), score, perf_counter() - started
    )


def exact_connected(
    graph: CoverageGraph,
    connectivity: dict[str, set[str]],
    k: int,
    max_combinations: int = 100_000,
) -> Solution:
    """Resolver cobertura máxima restringida a conjuntos de antenas conectados."""
    started = perf_counter()
    graph.validate()
    if not isinstance(k, int) or isinstance(k, bool) or k < 0:
        raise ValueError("k debe ser un entero no negativo")
    if max_combinations < 1:
        raise ValueError("max_combinations debe ser positivo")
    antennas = sorted(graph.coverage)
    antenna_set = set(antennas)
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
    size = min(k, len(antennas))
    count = sum(
        comb(len(antennas), selected_size) for selected_size in range(1, size + 1)
    )
    if count > max_combinations:
        raise ExactLimitExceeded(
            f"Conectado omitido: {count} combinaciones de hasta {size} > {max_combinations}"
        )
    best, covered_best, score = (), set(), 0.0
    for selected_size in range(1, size + 1):
        for selected in combinations(antennas, selected_size):
            if not _is_connected(selected, connectivity):
                continue
            covered = set().union(*(graph.coverage[antenna] for antenna in selected))
            weight = graph.weight(covered)
            if weight > score:
                best, covered_best, score = selected, covered, weight
    return Solution(
        "exact_connected",
        best,
        frozenset(covered_best),
        score,
        perf_counter() - started,
    )


def _is_connected(selected: tuple[str, ...], connectivity: dict[str, set[str]]) -> bool:
    if not selected:
        return False
    pending = [selected[0]]
    visited = set()
    allowed = set(selected)
    while pending:
        node = pending.pop()
        if node in visited:
            continue
        visited.add(node)
        pending.extend(connectivity[node] & allowed - visited)
    return visited == allowed

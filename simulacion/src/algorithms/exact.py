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

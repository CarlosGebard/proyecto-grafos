import random
from itertools import combinations

import pytest

from src.algorithms.connected import (
    ExactLimitExceeded,
    greedy_conectado,
    min_antenas_para_objetivo,
    resolver,
)
from src.evaluation.metrics import metrics
from src.graph.models import CoverageGraph


def _conexo(selected, enlaces):
    """BFS independiente: única fuente de verdad de conectividad en tests."""
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
        pending.extend(enlaces[node] & allowed - visited)
    return visited == allowed


def _grafo_aleatorio(randomizer, candidatos=6, demandas=8, densidad=0.35):
    population = {str(i): randomizer.randint(0, 50) for i in range(demandas)}
    coverage = {
        str(a): {d for d in population if randomizer.random() < 0.4}
        for a in range(candidatos)
    }
    enlaces = {str(a): set() for a in range(candidatos)}
    for u, v in combinations(sorted(coverage), 2):
        if randomizer.random() < densidad:
            enlaces[u].add(v)
            enlaces[v].add(u)
    return CoverageGraph(coverage, population), enlaces


def _peso(graph, selected):
    coverage = graph.coverage
    return sum(
        w
        for d, w in graph.population.items()
        if any(d in coverage[a] for a in selected)
    )


def _oracle_libre(graph, k):
    pares = [
        (_peso(graph, selected), selected)
        for size in range(min(k, len(graph.coverage)) + 1)
        for selected in combinations(sorted(graph.coverage), size)
    ]
    mejor = max(peso for peso, _ in pares)
    mejor_S = min(s for peso, s in pares if peso == mejor)
    covered = {
        d for d in graph.population if any(d in graph.coverage[a] for a in mejor_S)
    }
    return mejor, mejor_S, covered


def _oracle_conectado(graph, enlaces, k, gateways):
    factibles = [
        selected
        for size in range(1, min(k, len(graph.coverage)) + 1)
        for selected in combinations(sorted(graph.coverage), size)
        if _conexo(selected, enlaces) and (gateways is None or set(selected) & gateways)
    ]
    if not factibles:
        return 0.0, (), frozenset()
    mejor = max(_peso(graph, selected) for selected in factibles)
    mejor_S = min(s for s in factibles if _peso(graph, s) == mejor)
    covered = frozenset(
        d for d in graph.population if any(d in graph.coverage[a] for a in mejor_S)
    )
    return float(mejor), mejor_S, covered


def test_free_counts_overlapping_localities_once():
    graph = CoverageGraph(
        {"a": {"x", "y"}, "b": {"x"}, "c": {"z"}}, {"x": 10, "y": 5, "z": 9}
    )
    result = resolver(graph, None, 2)
    assert result.selected == ("a", "c")
    assert result.population_covered == 24
    assert result.covered == {"x", "y", "z"}


@pytest.mark.parametrize("k", [0, 1, 3, 20])
def test_free_matches_independent_oracle(k):
    randomizer = random.Random(71)
    for _ in range(20):
        graph, _ = _grafo_aleatorio(randomizer)
        peso, mejor_S, covered = _oracle_libre(graph, k)
        result = resolver(graph, None, k)
        assert result.population_covered == peso
        assert result.selected == mejor_S  # desempate lexicográfico (I4)
        assert result.covered == covered
        assert len(result.selected) <= min(k, len(graph.coverage))


@pytest.mark.parametrize("con_gateway", [False, True])
@pytest.mark.parametrize("k", [1, 2, 3])
@pytest.mark.parametrize("semilla", [5, 12, 33])
def test_connected_matches_oracle(semilla, k, con_gateway):
    randomizer = random.Random(semilla)
    for _ in range(15):
        graph, enlaces = _grafo_aleatorio(randomizer)
        gateways = None
        if con_gateway:
            gateways = {a for a in enlaces if randomizer.random() < 0.3} or {"0"}
        peso, mejor_S, covered = _oracle_conectado(graph, enlaces, k, gateways)
        result = resolver(graph, enlaces, k, gateways=gateways)
        assert result.population_covered == peso
        assert result.selected == mejor_S
        assert result.covered == covered
        assert _conexo(result.selected, enlaces)


@pytest.mark.parametrize("semilla,k", [(1, 2), (2, 3), (3, 4)])
def test_esu_generates_each_connected_subset_once(semilla, k):
    randomizer = random.Random(semilla)
    for _ in range(10):
        graph, enlaces = _grafo_aleatorio(randomizer, 7, 7, 0.3)
        total = sum(
            1
            for size in range(1, min(k, len(enlaces)) + 1)
            for selected in combinations(sorted(enlaces), size)
            if _conexo(selected, enlaces)
        )
        sin_poda = resolver(graph, enlaces, k, poda=False)
        assert sin_poda.evaluations == total  # I1: cada conexo una vez
        con_poda = resolver(graph, enlaces, k)
        assert con_poda.evaluations <= total
        assert con_poda.population_covered == sin_poda.population_covered


def test_union_incremental_matches_recalculation():
    for semilla in (4, 8, 15):
        randomizer = random.Random(semilla)
        graph, enlaces = _grafo_aleatorio(randomizer, 6, 8, 0.4)
        resolver(graph, enlaces, 4, poda=False, verificar=True)  # I2
        resolver(graph, None, 4, poda=False, verificar=True)


def test_budget_exceeded_and_validation():
    graph = CoverageGraph({str(i): {"d"} for i in range(100)}, {"d": 1})
    with pytest.raises(ExactLimitExceeded, match="budget=50"):
        resolver(graph, None, 5, budget=50)
    with pytest.raises(ValueError, match="budget"):
        resolver(graph, None, 1, budget=0)


def test_k_above_candidates_enumerates_within_budget():
    graph = CoverageGraph({str(i): {"d"} for i in range(6)}, {"d": 1})
    result = resolver(graph, None, 100)
    assert result.population_covered == 1
    assert result.selected == ("0",)


def test_empty_zero_invalid_and_ties():
    assert resolver(CoverageGraph({}, {}), None, 4).population_covered == 0
    cero = resolver(CoverageGraph({"a": {"x"}}, {"x": 0}), None, 2)
    assert cero.population_covered == 0
    assert cero.selected == ("a",)  # peso 0: cuenta cobertura, no objetivo
    assert cero.covered == {"x"}
    graph = CoverageGraph({"b": {"d"}, "a": {"d"}}, {"d": 5})
    assert resolver(graph, None, 1).selected == ("a",)
    for k in (-1, 0.5, True):
        with pytest.raises(ValueError):
            resolver(graph, None, k)
    for weight in (-1, float("nan"), float("inf")):
        with pytest.raises(ValueError):
            resolver(CoverageGraph({"a": {"d"}}, {"d": weight}), None, 1)
    with pytest.raises(ValueError):
        resolver(CoverageGraph({"a": {"missing"}}, {}), None, 1)


def test_connected_rejects_isolated_high_coverage_candidate():
    graph = CoverageGraph(
        {"a": {"x"}, "b": {"y"}, "c": {"z"}},
        {"x": 60, "y": 60, "z": 100},
    )
    links = {"a": {"b"}, "b": {"a"}, "c": set()}
    result = resolver(graph, links, 2)
    assert result.selected == ("a", "b")
    assert result.population_covered == 120


def test_connected_allows_singleton_and_validates_links():
    graph = CoverageGraph({"a": {"x"}, "b": {"y"}}, {"x": 4, "y": 8})
    assert resolver(graph, {"a": set(), "b": set()}, 2).selected == ("b",)
    with pytest.raises(ValueError, match="simétrica"):
        resolver(graph, {"a": {"b"}, "b": set()}, 2)
    with pytest.raises(ValueError, match="todos los candidatos"):
        resolver(graph, {"a": set()}, 2)
    with pytest.raises(ExactLimitExceeded):
        resolver(graph, {"a": set(), "b": set()}, 2, budget=1)


def test_gateway_requirement_and_errors():
    graph = CoverageGraph({"a": {"x"}, "b": {"y"}}, {"x": 10, "y": 20})
    enlaces = {"a": {"b"}, "b": {"a"}}
    solo_b = resolver(graph, enlaces, 1, gateways={"b"})
    assert solo_b.selected == ("b",)
    assert solo_b.population_covered == 20
    libre = resolver(graph, None, 1, gateways={"b"})
    assert libre.selected == ("b",)
    with pytest.raises(ValueError, match="gateways vacío"):
        resolver(graph, enlaces, 1, gateways=set())
    with pytest.raises(ValueError, match="desconocidos"):
        resolver(graph, enlaces, 1, gateways={"z"})
    with pytest.raises(ValueError, match="gateways vacío"):
        greedy_conectado(graph, enlaces, 1, gateways=[])
    # Gateway en componente aislada: singleton factible con f = 0.
    graph2 = CoverageGraph({"a": {"x"}, "z": set()}, {"x": 10})
    enlaces2 = {"a": set(), "z": set()}
    resultado = resolver(graph2, enlaces2, 1, gateways={"z"})
    assert resultado.selected == ("z",)
    assert resultado.population_covered == 0
    assert resolver(graph2, enlaces2, 0, gateways={"z"}).selected == ()


def test_greedy_never_beats_exact_and_respects_constraints():
    for semilla in (7, 21, 42):
        randomizer = random.Random(semilla)
        for _ in range(15):
            graph, enlaces = _grafo_aleatorio(randomizer)
            gateways = {a for a in enlaces if randomizer.random() < 0.3} or {"0"}
            exacto = resolver(graph, enlaces, 3, gateways=gateways)
            goloso = greedy_conectado(graph, enlaces, 3, gateways=gateways)
            assert goloso.population_covered <= exacto.population_covered
            assert _conexo(goloso.selected, enlaces)
            assert set(goloso.selected) & gateways
            libre = greedy_conectado(graph, None, 3)
            assert (
                libre.population_covered <= resolver(graph, None, 3).population_covered
            )


def test_greedy_deterministic_tie_and_margin_stop():
    graph = CoverageGraph({"a": {"x"}, "b": {"x"}}, {"x": 10})
    enlaces = {"a": {"b"}, "b": {"a"}}
    assert greedy_conectado(graph, enlaces, 1).selected == ("a",)
    inutil = CoverageGraph({"a": {"x"}, "b": set()}, {"x": 10})
    goloso = greedy_conectado(inutil, enlaces, 2)
    assert goloso.selected == ("a",)  # margen 0: no agrega antenas sin aporte
    assert goloso.evaluations == 2  # un margen por semilla (a y b), ambos con margen 0


def test_min_antennas_consistent_with_optimization():
    for semilla in (11, 22):
        randomizer = random.Random(semilla)
        for _ in range(15):
            graph, enlaces = _grafo_aleatorio(randomizer)
            total = sum(graph.population.values())
            t = randomizer.randint(1, total + 10)
            decision = min_antenas_para_objetivo(graph, enlaces, 5, t)
            exacto = resolver(graph, enlaces, 5)
            if decision is None:
                assert exacto.population_covered < t  # certificado del variante iii
            else:
                m, solucion = decision
                assert solucion.population_covered >= t
                assert resolver(graph, enlaces, m - 1).population_covered < t


def test_min_antennas_validation_and_threshold_zero():
    graph = CoverageGraph({"a": {"x"}}, {"x": 1})
    enlaces = {"a": set()}
    with pytest.raises(ValueError):
        min_antenas_para_objetivo(graph, enlaces, 1, -1)
    with pytest.raises(ValueError):
        min_antenas_para_objetivo(graph, enlaces, 1, float("nan"))
    with pytest.raises(ValueError):
        min_antenas_para_objetivo(graph, enlaces, -1, 1)
    assert min_antenas_para_objetivo(graph, enlaces, 0, 1) is None
    assert min_antenas_para_objetivo(graph, enlaces, 3, 0)[0] == 1
    m, solucion = min_antenas_para_objetivo(graph, enlaces, 3, 1)
    assert m == 1 and solucion.selected == ("a",)


def test_zero_denominator_metrics():
    graph = CoverageGraph({}, {})
    resultado = resolver(graph, None, 0)
    assert metrics(graph, resultado, 0)["coverage_percentage"] == 0
    assert metrics(graph, resultado, 0)["evaluations"] == 0

import random
from itertools import combinations

import pytest

from src.algorithms.exact import ExactLimitExceeded, exact
from src.evaluation.metrics import metrics
from src.graph.models import CoverageGraph


def test_exact_counts_overlapping_localities_once():
    graph = CoverageGraph(
        {"a": {"x", "y"}, "b": {"x"}, "c": {"z"}}, {"x": 10, "y": 5, "z": 9}
    )
    result = exact(graph, 2)
    assert result.selected == ("a", "c")
    assert result.population_covered == 24
    assert result.covered == {"x", "y", "z"}


@pytest.mark.parametrize("k", [0, 1, 3, 20])
def test_exact_matches_independent_at_most_k_oracle(k):
    randomizer = random.Random(71)
    for _ in range(20):
        population = {str(i): randomizer.randint(0, 50) for i in range(8)}
        coverage = {
            str(a): {d for d in population if randomizer.random() < 0.4}
            for a in range(6)
        }
        graph = CoverageGraph(coverage, population)
        oracle = max(
            sum(
                w
                for d, w in population.items()
                if any(d in coverage[a] for a in selected)
            )
            for size in range(min(k, len(coverage)) + 1)
            for selected in combinations(coverage, size)
        )
        result = exact(graph, k)
        assert result.population_covered == oracle
        assert len(result.selected) <= k


def test_exact_guard_and_extreme_k():
    graph = CoverageGraph({str(i): {"d"} for i in range(100)}, {"d": 1})
    with pytest.raises(ExactLimitExceeded):
        exact(graph, 50, max_combinations=100)
    assert exact(graph, 1000).population_covered == 1


def test_empty_zero_invalid_and_ties():
    assert exact(CoverageGraph({}, {}), 4).population_covered == 0
    assert exact(CoverageGraph({"a": {"x"}}, {"x": 0}), 2).selected == ()
    graph = CoverageGraph({"b": {"d"}, "a": {"d"}}, {"d": 5})
    assert exact(graph, 1).selected == ("a",)
    for k in (-1, 0.5, True):
        with pytest.raises(ValueError):
            exact(graph, k)
    for weight in (-1, float("nan"), float("inf")):
        with pytest.raises(ValueError):
            exact(CoverageGraph({"a": {"d"}}, {"d": weight}), 1)
    with pytest.raises(ValueError):
        exact(CoverageGraph({"a": {"missing"}}, {}), 1)


def test_zero_denominator_metrics():
    graph = CoverageGraph({}, {})
    assert metrics(graph, exact(graph, 0), 0)["coverage_percentage"] == 0

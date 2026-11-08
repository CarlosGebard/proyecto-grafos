from src.graph.models import CoverageGraph, Solution

# Estados de una localidad frente a la solución (ADR 0014):
# - covered: está en ∪ C(a) para a ∈ S (población afectada);
# - reachable: algún candidato la cubre, pero no uno de S (la dejaron fuera
#   k, la conectividad o el gateway);
# - unreachable: ningún candidato la cubre (límite de distancia, LOS, NoData
#   o generación de candidatos; no del algoritmo).
COVERAGE_STATES = ("covered", "reachable", "unreachable")


def coverage_status(graph: CoverageGraph, solution: Solution) -> dict[str, str]:
    reachable = set().union(*graph.coverage.values()) if graph.coverage else set()
    return {
        d: "covered"
        if d in solution.covered
        else "reachable"
        if d in reachable
        else "unreachable"
        for d in sorted(graph.population)
    }


def metrics(graph: CoverageGraph, solution: Solution, k: int) -> dict:
    total = graph.weight(set(graph.population))
    status = coverage_status(graph, solution)
    by_state = {
        state: {d for d, value in status.items() if value == state}
        for state in COVERAGE_STATES
    }
    return {
        "algorithm": solution.algorithm,
        "k": k,
        "num_candidates": len(graph.coverage),
        "num_demand_nodes": len(graph.population),
        "population_total": total,
        "population_covered": solution.population_covered,
        "coverage_percentage": 100 * solution.population_covered / total
        if total
        else 0.0,
        "population_uncovered_reachable": graph.weight(by_state["reachable"]),
        "population_unreachable": graph.weight(by_state["unreachable"]),
        "localities_by_status": {
            state: len(nodes) for state, nodes in by_state.items()
        },
        "runtime_seconds": solution.runtime_seconds,
        "evaluations": solution.evaluations,
        "selected": list(solution.selected),
        "covered": sorted(solution.covered),
    }

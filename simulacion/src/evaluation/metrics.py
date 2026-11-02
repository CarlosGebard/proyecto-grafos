from src.graph.models import CoverageGraph, Solution


def metrics(graph: CoverageGraph, solution: Solution, k: int) -> dict:
    total = graph.weight(set(graph.population))
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
        "runtime_seconds": solution.runtime_seconds,
        "selected": list(solution.selected),
        "covered": sorted(solution.covered),
    }

from src.graph.models import CoverageGraph


def build_graph(candidates, demands, coverage) -> CoverageGraph:
    if len({a.id for a in candidates}) != len(candidates):
        raise ValueError("Identificadores de candidatos duplicados")
    if len({d.id for d in demands}) != len(demands):
        raise ValueError("Identificadores de demanda duplicados")
    if set(coverage) != {a.id for a in candidates}:
        raise ValueError("La cobertura debe incluir exactamente todos los candidatos")
    graph = CoverageGraph(coverage, {d.id: d.population for d in demands})
    graph.validate()
    return graph

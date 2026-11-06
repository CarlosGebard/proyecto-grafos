"""Fase 0: medición del régimen Δ(G_conn) sobre los pilotos.

Lee directorios de salida del pipeline (``graph.json``, ``connectivity.json``,
``metrics.json``) y mide, por instancia:

- ``n``, ``k``, aristas de ``G_conn``, ``Δ̄``, ``Δ`` máximo y antenas aisladas;
- conteo real de subconjuntos conexos ≤ k con el motor ESU sin poda (invariante
  I1), contra el total de combinaciones Σ C(n,r) y el mayorante teórico
  n·Σ_r (e·(Δ̄−1))^(r−1) de [3];
- tasa de poda: evaluaciones con la cota de prefijos / sin ella;
- solapes de cobertura |C(u) ∩ C(v)|: pares con solape, media y máximo, y lo
  mismo restringido a pares enlazados en ``G_conn``.

Uso (desde ``simulacion/``)::

    uv run python docs/report/medicion_fase0.py outputs/biobio-regresion-esu

Escribe ``fase0.json`` en cada directorio medido. Insumo del informe (fase 3)
y de la validación del régimen Δ acotado (spec, §10 fase 0).
"""

import json
import sys
from itertools import combinations
from math import comb, e
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from src.algorithms.connected import resolver  # noqa: E402
from src.graph.models import CoverageGraph  # noqa: E402


def medir(salida: Path) -> dict:
    graph_data = json.loads((salida / "graph.json").read_text())
    connectivity = {
        antenna: set(neighbors)
        for antenna, neighbors in json.loads(
            (salida / "connectivity.json").read_text()
        ).items()
    }
    metrics = json.loads((salida / "metrics.json").read_text())
    k = metrics["results"][0]["k"]
    graph = CoverageGraph(
        {a: set(b) for a, b in graph_data["coverage"].items()},
        graph_data["population"],
    )
    graph.validate()
    cov = graph.coverage
    n = len(cov)
    aristas = sum(len(vecinos) for vecinos in connectivity.values()) // 2
    grados = [len(vecinos) for vecinos in connectivity.values()]
    delta_medio = 2 * aristas / n
    delta_max = max(grados)
    aislados = sum(1 for grado in grados if grado == 0)

    combos = sum(comb(n, r) for r in range(1, min(k, n) + 1))
    # Mayorante teórico del conteo de conexos (Wernicke 2006): cada nivel
    # agrega a lo más e·(Δmax−1) candidatos por nodo. Con Δ máx, no Δ̄: en
    # grafos muy dispersos Δ̄ < 1 vuelve la base negativa e inútil.
    mayorante = sum(n * (e * (delta_max - 1)) ** (r - 1) for r in range(1, k + 1))
    # Medición: el conteo sin poda debe completarse, no heredar el presupuesto
    # del pipeline (instancias densas por criterio superan el default de 100k).
    sin_poda = resolver(graph, connectivity, k, poda=False, budget=50_000_000)
    con_poda = resolver(graph, connectivity, k, budget=50_000_000)

    solapes = [
        len(cov[u] & cov[v]) for u, v in combinations(sorted(cov), 2) if cov[u] & cov[v]
    ]
    enlaces_solape = [
        len(cov[u] & cov[v])
        for u in sorted(cov)
        if connectivity[u]
        for v in connectivity[u]
        if cov[u] & cov[v] and u < v
    ]
    exacto = metrics["results"][1]["population_covered"]
    goloso = metrics["results"][2]["population_covered"]
    return {
        "instancia": salida.name,
        "n": n,
        "k": k,
        "aristas_gconn": aristas,
        "delta_medio": round(delta_medio, 2),
        "delta_max": delta_max,
        "aislados": aislados,
        "combinaciones_sigma": combos,
        "mayorante_teórico": round(mayorante),
        "conexos_reales": sin_poda.evaluations,
        "evaluaciones_con_poda": con_poda.evaluations,
        "tasa_poda": round(1 - con_poda.evaluations / sin_poda.evaluations, 4),
        "pares_con_solape": len(solapes),
        "solape_medio": round(sum(solapes) / len(solapes), 2) if solapes else 0,
        "solape_maximo": max(solapes, default=0),
        "enlaces_con_solape": len(enlaces_solape),
        "solape_enlaces_medio": (
            round(sum(enlaces_solape) / len(enlaces_solape), 2) if enlaces_solape else 0
        ),
        "solape_enlaces_maximo": max(enlaces_solape, default=0),
        "exacto_conectado": exacto,
        "goloso": goloso,
        "razon_goloso": round(goloso / exacto, 4) if exacto else 0.0,
    }


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__)
        return 1
    filas = [medir(Path(ruta)) for ruta in argv]
    columnas = list(filas[0])
    anchos = {
        col: max(len(col), *(len(str(fila[col])) for fila in filas)) for col in columnas
    }
    print(" | ".join(col.ljust(anchos[col]) for col in columnas))
    print("-|-".join("-" * anchos[col] for col in columnas))
    for fila in filas:
        print(" | ".join(str(fila[col]).ljust(anchos[col]) for col in columnas))
    for ruta, fila in zip(argv, filas, strict=True):
        destino = Path(ruta) / "fase0.json"
        destino.write_text(json.dumps(fila, indent=2, ensure_ascii=False) + "\n")
        print(f"fase0.json -> {destino}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

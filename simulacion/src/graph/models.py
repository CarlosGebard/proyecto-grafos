"""Tipos independientes de la carga GIS y de los algoritmos."""

from dataclasses import dataclass
from math import isfinite

from shapely.geometry import Point
from shapely.geometry.base import BaseGeometry


@dataclass(frozen=True)
class DemandNode:
    id: str
    geometry: BaseGeometry  # CRS métrico del estudio, sin recortar población.
    latitude: float
    longitude: float
    population: float
    point: Point  # Punto interior donde se evalúa la cobertura.


@dataclass(frozen=True)
class AntennaCandidate:
    id: str
    latitude: float
    longitude: float
    elevation: float
    point: Point
    constraint_status: str = "not_evaluated"
    constraint_rule: str | None = None


@dataclass
class CoverageGraph:
    coverage: dict[str, set[str]]
    population: dict[str, float]

    def validate(self) -> None:
        if any(not isfinite(w) or w < 0 for w in self.population.values()):
            raise ValueError("Los pesos deben ser finitos y no negativos")
        for nodes in self.coverage.values():
            if not nodes <= self.population.keys():
                raise ValueError("El grafo contiene demanda desconocida")

    def weight(self, nodes: set[str]) -> float:
        return sum(self.population[d] for d in sorted(nodes))


@dataclass(frozen=True)
class Solution:
    algorithm: str
    selected: tuple[str, ...]
    covered: frozenset[str]
    population_covered: float
    runtime_seconds: float

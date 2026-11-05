"""Filtro por distancia métrica antes de evaluar el modelo de visibilidad."""

import math
from itertools import combinations

import numpy as np

from src.geo.line_of_sight import has_line_of_sight


def compute_coverage(
    candidates,
    demands,
    dem,
    max_distance_m: float,
    antenna_height_m: float,
    receiver_height_m: float,
    sample_step_m: float | None = None,
    max_pairs: int = 2_000_000,
    visibility=has_line_of_sight,
) -> tuple[dict[str, set[str]], dict]:
    if not math.isfinite(max_distance_m) or max_distance_m <= 0:
        raise ValueError("max_distance_m debe ser positivo y finito")
    pairs = len(candidates) * len(demands)
    if pairs > max_pairs:
        raise ValueError(
            f"{pairs} pares exceden max_pairs={max_pairs}; reducir el área"
        )
    xy = np.array([(d.point.x, d.point.y) for d in demands]).reshape(-1, 2)
    missing_elevation = ~np.isfinite(dem.sample(xy))
    coverage = {}
    checked = 0
    for antenna in candidates:
        start = (antenna.point.x, antenna.point.y)
        distances = np.linalg.norm(xy - start, axis=1)
        neighbors = np.flatnonzero(distances <= max_distance_m)
        checked += len(neighbors)
        coverage[antenna.id] = {
            demands[j].id
            for j in neighbors
            if visibility(
                dem, start, xy[j], antenna_height_m, receiver_height_m, sample_step_m
            )
        }
    return coverage, {
        "num_pairs": pairs,
        "los_checks": checked,
        "num_edges": sum(map(len, coverage.values())),
        "demand_nodata_ids": [
            d.id
            for d, missing in zip(demands, missing_elevation, strict=True)
            if missing
        ],
    }


def compute_connectivity(
    candidates,
    dem,
    max_distance_m: float,
    antenna_height_m: float,
    sample_step_m: float | None = None,
    max_pairs: int = 2_000_000,
    visibility=has_line_of_sight,
) -> tuple[dict[str, set[str]], dict]:
    """Construir enlaces LOS no dirigidos entre candidatos de antena."""
    if not math.isfinite(max_distance_m) or max_distance_m <= 0:
        raise ValueError("max_distance_m debe ser positivo y finito")
    pairs = len(candidates) * (len(candidates) - 1) // 2
    if pairs > max_pairs:
        raise ValueError(
            f"{pairs} pares exceden max_pairs={max_pairs}; reducir candidatos"
        )
    links = {candidate.id: set() for candidate in candidates}
    checked = 0
    for left, right in combinations(candidates, 2):
        start = (left.point.x, left.point.y)
        end = (right.point.x, right.point.y)
        if float(np.linalg.norm(np.subtract(end, start))) > max_distance_m:
            continue
        checked += 1
        if visibility(
            dem,
            start,
            end,
            antenna_height_m,
            antenna_height_m,
            sample_step_m,
        ):
            links[left.id].add(right.id)
            links[right.id].add(left.id)
    return links, {
        "num_pairs": pairs,
        "los_checks": checked,
        "num_edges": sum(map(len, links.values())) // 2,
    }

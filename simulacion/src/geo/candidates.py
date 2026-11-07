"""Generación de candidatos por criterio territorial (ADR 0007).

Base teórica: Murray & Tong (2007), cobertura máxima en espacio continuo —
para cobertura circular con demanda puntual basta considerar como candidatos
los puntos de demanda y las intersecciones de circunferencias de radio de
cobertura. Ajustes propios del proyecto: radios por clase de potencia,
sitios altos del DEM (favorables a LOS), filtro de pendiente por
constructabilidad y presupuesto de pares LOS.
"""

import math
from itertools import product

import numpy as np
import shapely
from pyproj import Transformer
from shapely.geometry import Point

from src.graph.models import AntennaCandidate

MAX_INTERSECTION_COMBOS = 1_000_000


def _circle_intersections(p1, p2, r1, r2):
    """Puntos a distancia r1 de p1 y r2 de p2 (0, 1 o 2 puntos)."""
    dx, dy = p2[0] - p1[0], p2[1] - p1[1]
    d = math.hypot(dx, dy)
    if d == 0 or d > r1 + r2 or d < abs(r1 - r2):
        return []
    a = (r1 * r1 - r2 * r2 + d * d) / (2 * d)
    h_sq = r1 * r1 - a * a
    if h_sq < 0:  # sólo por redondeo flotante
        return []
    h = math.sqrt(h_sq)
    ux, uy = dx / d, dy / d
    bx, by = p1[0] + a * ux, p1[1] + a * uy
    points = [(bx + h * -uy, by + h * ux)]
    if h > 0:
        points.append((bx - h * -uy, by - h * ux))
    return points


def _local_maxima_points(dem, window_m: float):
    """Coordenadas métricas de máximos locales del DEM en ventanas window_m.

    Empate de mesetas: supresión no-máxima determinista, un sitio por ventana,
    ordenado por elevación descendente y fila/columna.
    """
    values = dem.values
    rows, cols = values.shape
    half = max(1, int(round(window_m / 2 / dem.resolution_m)))
    focal = values.copy()
    shifted = np.full(values.shape, np.nan)
    for dy in range(-half, half + 1):
        for dx in range(-half, half + 1):
            if dx == 0 and dy == 0:
                continue
            dst_row, src_row = max(0, -dy), max(0, dy)
            dst_col, src_col = max(0, -dx), max(0, dx)
            height = min(rows - dst_row, rows - src_row)
            width = min(cols - dst_col, cols - src_col)
            if height <= 0 or width <= 0:
                continue
            shifted.fill(np.nan)
            shifted[dst_row : dst_row + height, dst_col : dst_col + width] = values[
                src_row : src_row + height, src_col : src_col + width
            ]
            np.fmax(focal, shifted, out=focal)
    row_idx, col_idx = np.nonzero(np.isfinite(values) & (values == focal))
    order = sorted(
        zip(values[row_idx, col_idx], row_idx, col_idx, strict=True),
        key=lambda item: (-item[0], item[1], item[2]),
    )
    # Supresión no-máxima determinista: un sitio por ventana, con búsqueda
    # O(1) por cubetas de tamaño half+1 (planicies enteras serían O(n^2)).
    bucket_size = half + 1
    kept = []
    buckets: dict[tuple[int, int], list[tuple[int, int]]] = {}
    for elevation, row, col in order:
        br, bc = row // bucket_size, col // bucket_size
        if any(
            abs(row - r) <= half and abs(col - c) <= half
            for br2, bc2 in product((br - 1, br, br + 1), (bc - 1, bc, bc + 1))
            for r, c in buckets.get((br2, bc2), ())
        ):
            continue
        kept.append((elevation, row, col))
        buckets.setdefault((br, bc), []).append((row, col))
    if not kept:
        return []
    px = np.array([col + 0.5 for _, _, col in kept])
    py = np.array([row + 0.5 for _, row, _ in kept])
    xs = dem.transform.a * px + dem.transform.b * py + dem.transform.c
    ys = dem.transform.d * px + dem.transform.e * py + dem.transform.f
    return list(zip(xs.tolist(), ys.tolist()))


def generate_candidates(
    area,
    dem,
    demands,
    radii,
    max_candidates: int = 10_000,
    highsite_window_m: float = 1000.0,
    max_slope_deg: float = 30.0,
    separation_m: float = 1000.0,
):
    """Candidatos por criterio: demandas + intersecciones + sitios altos.

    demands: DemandNode en CRS métrico (usa .point). radii: radios efectivos
    de las clases de potencia más max_distance_m. El filtro de proximidad
    (separation_m) evita que el tope llene la instancia con puntos casi
    duplicados de un mismo clúster; devuelve (candidatos, audit).
    """
    radii = sorted({float(value) for value in radii})
    if not radii or any(not math.isfinite(value) or value <= 0 for value in radii):
        raise ValueError("radios de generación deben ser positivos y finitos")
    if not math.isfinite(max_slope_deg) or not 0 < max_slope_deg < 90:
        raise ValueError("max_slope_deg debe estar entre 0 y 90 grados")
    if not math.isfinite(highsite_window_m) or highsite_window_m <= 0:
        raise ValueError("highsite_window_m debe ser positivo y finito")
    if not math.isfinite(separation_m) or separation_m <= 0:
        raise ValueError("separation_m debe ser positivo y finito")
    points: dict[tuple[int, int], tuple[int, float, float, str]] = {}

    def add(x: float, y: float, priority: int, prefix: str):
        key = (int(round(x)), int(round(y)))
        existing = points.get(key)
        if existing is None or priority < existing[0]:
            points[key] = (priority, x, y, prefix)

    for node in demands:
        add(node.point.x, node.point.y, 0, f"d_{node.id}")
    combos = (len(demands) * (len(demands) - 1) // 2) * len(radii) ** 2
    if combos > MAX_INTERSECTION_COMBOS:
        raise ValueError(
            f"{combos} combinaciones de intersección exceden {MAX_INTERSECTION_COMBOS};"
            " reducir localidades o clases de potencia"
        )
    intersections = 0
    for i, j in (
        (i, j) for i in range(len(demands)) for j in range(i + 1, len(demands))
    ):
        p1, p2 = (
            (demands[i].point.x, demands[i].point.y),
            (
                demands[j].point.x,
                demands[j].point.y,
            ),
        )
        for r1, r2 in product(radii, radii):
            for x, y in _circle_intersections(p1, p2, r1, r2):
                add(x, y, 1, None)
                intersections += 1
    highsites = _local_maxima_points(dem, highsite_window_m)
    for x, y in highsites:
        add(x, y, 2, None)
    raw = len(points)
    keys = sorted(points, key=lambda key: (points[key][0], key))
    xs = np.array([points[key][1] for key in keys])
    ys = np.array([points[key][2] for key in keys])
    geometries = shapely.points(xs, ys)
    inside = np.asarray(
        shapely.covers(np.full(len(keys), area), geometries), dtype=bool
    )
    elevations = dem.sample(np.column_stack([xs, ys]))
    finite = np.isfinite(elevations)
    slopes = dem.slope_sample(np.column_stack([xs, ys]))
    gentle = np.isfinite(slopes) & (slopes <= max_slope_deg + 1e-9)
    keep = inside & finite & gentle
    excluded_nodata = int((inside & ~finite).sum())
    excluded_slope = int((inside & finite & ~gentle).sum())
    weights = np.array([node.population for node in demands], dtype=float)
    demand_xy = np.array([[node.point.x, node.point.y] for node in demands])
    kept_indices = np.nonzero(keep)[0]
    scores_kept = np.zeros(len(kept_indices))
    if len(demands) and len(kept_indices):
        kept_xy = np.column_stack([xs[kept_indices], ys[kept_indices]])
        radius_max = radii[-1]
        scores_kept[:] = 0.0
        for start in range(0, len(kept_xy), 10_000):
            block = kept_xy[start : start + 10_000]
            distances = np.linalg.norm(
                block[:, None, :] - demand_xy[None, :, :], axis=2
            )
            scores_kept[start : start + len(block)] = (
                distances <= radius_max
            ) @ weights
    # Selección con proximidad: mayor puntaje primero y, a igualdad, clave
    # menor; se descarta cualquier punto más cerca de un aceptado que
    # separation_m (cubetas O(1) por vecindario, igual que en sitios altos).
    # Sin este filtro el tope puede llenarse de puntos casi duplicados de un
    # mismo clúster: los puntajes por distancia empata n en toda la ventana.
    order = sorted(
        range(len(kept_indices)),
        key=lambda index: (-scores_kept[index], keys[kept_indices[index]]),
    )
    bucket = separation_m
    survivors = []
    occupied: dict[tuple[int, int], list[tuple[float, float]]] = {}
    for index in order:
        idx = kept_indices[index]
        x, y = float(xs[idx]), float(ys[idx])
        br, bc = int(x // bucket), int(y // bucket)
        if any(
            (x - ox) ** 2 + (y - oy) ** 2 < bucket * bucket
            for row in (br - 1, br, br + 1)
            for col in (bc - 1, bc, bc + 1)
            for ox, oy in occupied.get((row, col), ())
        ):
            continue
        survivors.append(idx)
        occupied.setdefault((br, bc), []).append((x, y))
    excluded_proximity = len(kept_indices) - len(survivors)
    capped = len(survivors) > max_candidates
    selected = survivors[:max_candidates]
    transformer = Transformer.from_crs(dem.crs, 4326, always_xy=True)
    candidates = []
    for index in selected:
        key = keys[index]
        priority, x, y, prefix = points[key]
        if prefix is None:
            prefix = ("x_" if priority == 1 else "h_") + f"{key[0]}_{key[1]}"
        lon, lat = transformer.transform(x, y)
        candidates.append(
            AntennaCandidate(
                prefix,
                lat,
                lon,
                float(elevations[index]),
                Point(x, y),
            )
        )
    candidates.sort(key=lambda candidate: candidate.id)
    audit = {
        "method": "demand_anchors_circle_intersections_highsites",
        "reference": "Murray & Tong 2007 (IJGIS 21(7)); ADR 0007",
        "radii_m": radii,
        "raw_points": raw,
        "demand_anchors": len(demands),
        "circle_intersections": intersections,
        "highsites": len(highsites),
        "excluded_outside_area": int((~inside).sum()),
        "excluded_nodata": excluded_nodata,
        "excluded_slope": excluded_slope,
        "max_slope_deg": max_slope_deg,
        "highsite_window_m": highsite_window_m,
        "separation_m": separation_m,
        "excluded_proximity": excluded_proximity,
        "max_candidates": max_candidates,
        "capped": capped,
        "kept": len(candidates),
    }
    return candidates, audit

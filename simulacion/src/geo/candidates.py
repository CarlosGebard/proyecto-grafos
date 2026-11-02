import math

import numpy as np
from pyproj import Transformer
from shapely.geometry import Point

from src.graph.models import AntennaCandidate


def generate_candidates(area, dem, spacing_m: float, max_candidates: int = 10_000):
    if not math.isfinite(spacing_m) or spacing_m <= 0:
        raise ValueError("candidate_spacing_m debe ser positivo y finito")
    left, bottom, right, top = area.bounds
    # Origen UTM fijo: los puntos se repiten incluso si se modifica el bbox.
    x0, x1 = math.ceil(left / spacing_m), math.floor(right / spacing_m)
    y0, y1 = math.ceil(bottom / spacing_m), math.floor(top / spacing_m)
    size = max(0, x1 - x0 + 1) * max(0, y1 - y0 + 1)
    if size > max_candidates:
        raise ValueError(
            f"Grilla de {size} candidatos excede el límite {max_candidates}"
        )
    transformer = Transformer.from_crs(dem.crs, 4326, always_xy=True)
    candidates = []
    invalid = 0
    for iy in range(y0, y1 + 1):
        for ix in range(x0, x1 + 1):
            point = Point(ix * spacing_m, iy * spacing_m)
            if not area.covers(point):
                continue
            elevation = dem.sample([(point.x, point.y)])[0]
            if not np.isfinite(elevation):
                invalid += 1
                continue
            lon, lat = transformer.transform(point.x, point.y)
            candidates.append(
                AntennaCandidate(f"a_{ix}_{iy}", lat, lon, float(elevation), point)
            )
    return candidates, {"grid_points": size, "excluded_nodata": invalid}

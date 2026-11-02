"""LOS geométrico aproximado, reemplazable por otro modelo de cobertura."""

import math

import numpy as np


def has_line_of_sight(
    dem,
    start,
    end,
    antenna_height_m: float = 30.0,
    receiver_height_m: float = 1.5,
    sample_step_m: float | None = None,
) -> bool:
    for height in (antenna_height_m, receiver_height_m):
        if not math.isfinite(height) or height < 0:
            raise ValueError("Las alturas deben ser finitas y no negativas")
    # Como máximo medio píxel; evita que un paso CLI grueso salte una loma.
    step = dem.resolution_m / 2 if sample_step_m is None else sample_step_m
    if not math.isfinite(step) or not 0 < step <= dem.resolution_m / 2:
        raise ValueError("El paso LOS debe ser positivo y no superar medio píxel DEM")
    start, end = np.asarray(start, dtype=float), np.asarray(end, dtype=float)
    distance = float(np.linalg.norm(end - start))
    samples = max(1, math.ceil(distance / step))
    if samples > 1_000_000:
        raise ValueError("Perfil LOS demasiado grande")
    t = np.linspace(0, 1, samples + 1)
    ground = dem.sample(start[None, :] + t[:, None] * (end - start))
    if not np.isfinite(ground).all():
        return False
    visual = (ground[0] + antenna_height_m) * (1 - t) + (
        ground[-1] + receiver_height_m
    ) * t
    return bool(np.all(ground[1:-1] <= visual[1:-1] + 1e-9))

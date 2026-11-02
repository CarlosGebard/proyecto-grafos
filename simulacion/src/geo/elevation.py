"""Muestreador en memoria de un recorte DEM métrico pequeño."""

import numpy as np
import rasterio
from pyproj import CRS


class ElevationModel:
    def __init__(self, path):
        with rasterio.open(path) as source:
            self.crs = CRS(source.crs)
            if not self.crs.is_projected or any(
                axis.unit_name != "metre" for axis in self.crs.axis_info
            ):
                raise ValueError("El DEM de cálculo debe estar en un CRS métrico")
            self.values = source.read(1, masked=True).astype(float).filled(np.nan)
            self.transform = source.transform
            self.resolution_m = min(abs(v) for v in source.res)

    def sample(self, xy) -> np.ndarray:
        points = np.asarray(xy, dtype=float).reshape(-1, 2)
        result = np.full(len(points), np.nan)
        if not len(points):
            return result
        if not np.isfinite(points).all():
            raise ValueError("Coordenadas de muestreo no finitas")
        inverse = ~self.transform
        columns = np.floor(
            inverse.a * points[:, 0] + inverse.b * points[:, 1] + inverse.c
        ).astype(int)
        rows = np.floor(
            inverse.d * points[:, 0] + inverse.e * points[:, 1] + inverse.f
        ).astype(int)
        valid = (
            (rows >= 0)
            & (rows < self.values.shape[0])
            & (columns >= 0)
            & (columns < self.values.shape[1])
        )
        result[valid] = self.values[rows[valid], columns[valid]]
        return result

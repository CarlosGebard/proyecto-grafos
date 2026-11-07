"""Exportación liviana del DEM para visualización web."""

import math
from pathlib import Path

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.warp import transform_bounds

from src.visualization import palettes


def terrain_payload(path: Path, hypsometric_palette: str, max_side: int = 160) -> dict:
    """Reducir un GeoTIFF a una grilla JSON apta para el visor.

    Artefacto de comunicación (ADR 0003): nunca se usa para recalcular LOS.
    Incluye la rampa hipsométrica recortada al rango real para que el mapa
    PNG y la malla 3D compartan tinta exacta.
    """
    if type(max_side) is not int or max_side < 2:
        raise ValueError("max_side debe ser un entero mayor o igual a 2")
    with rasterio.open(path) as dataset:
        if dataset.crs is None:
            raise ValueError("DEM sin CRS")
        scale = min(1.0, max_side / max(dataset.width, dataset.height))
        width = max(2, round(dataset.width * scale))
        height = max(2, round(dataset.height * scale))
        values = dataset.read(
            1,
            out_shape=(height, width),
            masked=True,
            resampling=Resampling.bilinear,
        ).filled(np.nan)
        finite = values[np.isfinite(values)]
        if not finite.size:
            raise ValueError("DEM sin elevaciones válidas")
        minimum_m = float(finite.min())
        maximum_m = float(finite.max())
        west, south, east, north = transform_bounds(
            dataset.crs, "EPSG:4326", *dataset.bounds, densify_pts=21
        )
        metric_bounds = list(dataset.bounds)
        metric_crs = dataset.crs.to_string()
    return {
        "bounds_wgs84": [west, south, east, north],
        "bounds_metric_m": metric_bounds,
        "metric_crs": metric_crs,
        "width": width,
        "height": height,
        "elevation_min_m": minimum_m,
        "elevation_max_m": maximum_m,
        "palette": {
            "name": hypsometric_palette,
            "stops": palettes.resampled_stops(
                hypsometric_palette, minimum_m, maximum_m
            ),
        },
        "elevations_m": [
            [float(value) if math.isfinite(value) else None for value in row]
            for row in values
        ],
    }

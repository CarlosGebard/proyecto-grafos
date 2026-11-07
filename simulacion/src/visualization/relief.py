"""Fondo hipsométrico con sombreado para el mapa PNG (matplotlib).

Tinta + hillshade compuestos en un solo paso (`LightSource.shade`): el patrón
estándar es *hypsometrically tinted shaded relief*. La rampa y las clases de
elevación vienen de `src.visualization.palettes` (misma fuente que el payload
web), así el PNG y el visor 3D comparten tinta exacta.
"""

from pathlib import Path

import numpy as np
import rasterio
from matplotlib.colors import BoundaryNorm, LightSource, LinearSegmentedColormap

from src.visualization import palettes

# Sombreado clásico Imhof/USGS: sol del noroeste a 45°.
AZIMUTH_DEG = 315.0
ALTITUDE_DEG = 45.0
# Con celdas de 25-30 m y relieves centenarios chilenos, la sombra "verdad"
# se ve plana; 2.5× es la práctica habitual para realzar pendientes suaves.
VERTICAL_EXAGGERATION = 2.5
NODATA_HEX = "#D8D8D8"


def hypsometric_colormap(name: str, minimum_m: float, maximum_m: float):
    pairs = palettes.ramp(name, minimum_m, maximum_m)
    return LinearSegmentedColormap.from_list(
        f"hypso-{name}-{minimum_m:.0f}-{maximum_m:.0f}",
        [(fraction, palettes.hex_to_rgb(hex_value)) for fraction, hex_value in pairs],
    )


def elevation_breaks(minimum_m: float, maximum_m: float) -> np.ndarray:
    """Quiebres redondos para clases discretas (4 a 9 clases)."""
    if not (maximum_m > minimum_m):
        return np.array([minimum_m - 0.5, minimum_m + 0.5])
    for step in (25, 50, 100, 150, 200, 250, 500, 1000):
        breaks = np.arange(
            np.floor(minimum_m / step) * step, maximum_m + step, step, dtype=float
        )
        if len(breaks) <= 10:
            return breaks
    return np.array([minimum_m, maximum_m])


def paint_relief(ax, dem_path: Path, palette_name: str) -> dict:
    """Dibuja tinta hipsométrica + hillshade como fondo del ax (CRS métrico).

    Devuelve {"norm", "cmap", "has_nodata"} para armar la leyenda de clases.
    """
    with rasterio.open(dem_path) as dataset:
        if dataset.crs is None:
            raise ValueError("DEM sin CRS")
        values = dataset.read(1, masked=True).astype("float64")
        resolution = float(min(dataset.res))
        left, bottom, right, top = dataset.bounds
    finite = values.compressed() if np.ma.isMaskedArray(values) else values.ravel()
    finite = finite[np.isfinite(finite)]
    if finite.size == 0:
        raise ValueError("DEM sin elevaciones válidas")
    minimum_m, maximum_m = float(finite.min()), float(finite.max())

    data = (
        np.ma.filled(values, np.nan)
        if np.ma.isMaskedArray(values)
        else np.asarray(values)
    )
    mask = ~np.isfinite(data)
    cmap = hypsometric_colormap(palette_name, minimum_m, maximum_m)
    breaks = elevation_breaks(minimum_m, maximum_m)
    norm = BoundaryNorm(breaks, cmap.N)

    light_source = LightSource(azdeg=AZIMUTH_DEG, altdeg=ALTITUDE_DEG)
    shaded = light_source.shade(
        np.where(mask, minimum_m, data),
        cmap=cmap,
        norm=norm,
        vert_exag=VERTICAL_EXAGGERATION,
        dx=resolution,
        dy=resolution,
        blend_mode="soft",
    )
    if mask.any():
        red, green, blue = palettes.hex_to_rgb(NODATA_HEX)
        shaded[mask] = (red, green, blue)

    ax.imshow(
        shaded,
        extent=(left, right, bottom, top),
        origin="upper",
        interpolation="bilinear",
        zorder=0,
    )
    return {
        "norm": norm,
        "cmap": cmap,
        "breaks": breaks,
        "has_nodata": bool(mask.any()),
    }

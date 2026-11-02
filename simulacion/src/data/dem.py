"""Recorte y reproyección acotados; salida GeoTIFF métrica con NoData explícito."""

import math
from pathlib import Path

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.merge import merge
from rasterio.transform import from_origin
from rasterio.vrt import WarpedVRT

from src.data.prepare import download
from src.geo.area import project_geometry


def copernicus_tiles(bounds, directory: Path, max_tiles: int = 4) -> list[Path]:
    west, south, east, north = bounds
    cells = [
        (lat, lon)
        for lat in range(math.floor(south), math.ceil(north))
        for lon in range(math.floor(west), math.ceil(east))
    ]
    if len(cells) > max_tiles:
        raise ValueError(f"El área necesita {len(cells)} tiles; límite {max_tiles}")
    paths = []
    for lat, lon in cells:
        name = (
            f"Copernicus_DSM_COG_10_{'N' if lat >= 0 else 'S'}{abs(lat):02d}_00_"
            f"{'E' if lon >= 0 else 'W'}{abs(lon):03d}_00_DEM"
        )
        url = f"https://copernicus-dem-30m.s3.amazonaws.com/{name}/{name}.tif"
        paths.append(download(url, directory / f"{name}.tif"))
    return paths


def prepare_dem(
    sources: list[Path],
    area_wgs84,
    metric_crs,
    output: Path,
    resolution_m: float | None = None,
    max_pixels: int = 10_000_000,
) -> dict:
    area = project_geometry(area_wgs84, 4326, metric_crs)
    with rasterio.open(sources[0]) as source:
        if source.crs is None:
            raise ValueError("DEM sin CRS")
        if resolution_m is None:
            # JP2 local ya es métrico; Copernicus geográfico usa 30 m.
            resolution_m = (
                min(abs(v) for v in source.res) if source.crs == metric_crs else 30.0
            )
    if not math.isfinite(resolution_m) or resolution_m <= 0:
        raise ValueError("La resolución DEM debe ser positiva y finita")
    left, bottom, right, top = area.buffer(resolution_m * 2).bounds
    width = math.ceil((right - left) / resolution_m)
    height = math.ceil((top - bottom) / resolution_m)
    if width * height > max_pixels:
        raise ValueError(f"Recorte DEM de {width * height} píxeles excede {max_pixels}")
    transform = from_origin(left, top, resolution_m, resolution_m)
    output.parent.mkdir(parents=True, exist_ok=True)
    # Cada VRT tiene exactamente la ventana del estudio, nunca el mosaico nacional.
    from contextlib import ExitStack

    with ExitStack() as stack:
        datasets = [stack.enter_context(rasterio.open(path)) for path in sources]
        if any(d.crs is None for d in datasets):
            raise ValueError("DEM sin CRS")
        vrts = [
            stack.enter_context(
                WarpedVRT(
                    d,
                    crs=metric_crs,
                    transform=transform,
                    width=width,
                    height=height,
                    dtype="float32",
                    nodata=np.nan,
                    resampling=Resampling.nearest,
                )
            )
            for d in datasets
        ]
        if len(vrts) == 1:
            values = vrts[0].read(1)
        else:
            values = merge(vrts, nodata=np.nan)[0][0]
        if not np.isfinite(values).any():
            raise ValueError("DEM sin elevaciones válidas en el área elegida")
        with rasterio.open(
            output,
            "w",
            driver="GTiff",
            width=width,
            height=height,
            count=1,
            dtype="float32",
            crs=metric_crs,
            transform=transform,
            nodata=np.nan,
            compress="deflate",
        ) as destination:
            destination.write(values, 1)
        return {
            "sources": [str(p) for p in sources],
            "source_crs": [str(d.crs) for d in datasets],
            "source_resolution": [list(d.res) for d in datasets],
            "source_nodata": [str(d.nodata) for d in datasets],
            "output_crs": str(metric_crs),
            "resolution_m": resolution_m,
            "shape": [height, width],
            "resampling": "nearest",
            "valid_pixel_fraction": float(np.isfinite(values).mean()),
        }

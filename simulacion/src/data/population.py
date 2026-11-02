"""Localidades originales, sin inventar densidades ni repartir población."""

from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd

from src.geo.area import project_geometry
from src.graph.models import DemandNode


def load_population(
    path: Path,
    area_wgs84,
    metric_crs,
    population_field: str = "HABITANTES",
    id_field: str = "ID",
    layer: str | None = None,
) -> tuple[list[DemandNode], dict]:
    options = {"layer": layer} if layer else {}
    # GeoSeries permite que GeoPandas transforme el filtro al CRS de la fuente.
    frame = gpd.read_file(path, bbox=gpd.GeoSeries([area_wgs84], crs=4326), **options)
    if frame.crs is None:
        raise ValueError("La población no declara CRS; corregir la fuente")
    if not {population_field, id_field} <= set(frame.columns):
        raise ValueError(
            f"Faltan {population_field}/{id_field}; columnas: {list(frame.columns)}"
        )
    if (
        frame.geometry.isna().any()
        or frame.geometry.is_empty.any()
        or not frame.is_valid.all()
    ):
        raise ValueError("Hay geometrías vacías o inválidas en la población")
    if not frame.geom_type.isin(["Point", "Polygon", "MultiPolygon"]).all():
        raise ValueError("La demanda debe contener puntos o polígonos")
    frame = frame.to_crs(metric_crs)
    frame["demand_point"] = frame.geometry.representative_point()
    area = project_geometry(area_wgs84, 4326, metric_crs)
    frame = frame.loc[frame.demand_point.map(area.covers)].copy()
    weights = pd.to_numeric(frame[population_field], errors="coerce")
    if (weights.isna() & frame[population_field].notna()).any():
        raise ValueError("La población contiene valores no numéricos")
    unknown = weights.isna() | (weights == -99)
    if ((~np.isfinite(weights) | (weights < 0)) & ~unknown).any():
        raise ValueError(
            "Población inválida: sólo se admite -99 como marcador desconocido"
        )
    audit = {
        "records_in_area": len(frame),
        "excluded_unknown_population": int(unknown.sum()),
        "excluded_ids": frame.loc[unknown, id_field].astype(str).tolist(),
        "population_field": population_field,
        "id_field": id_field,
        "source_crs": str(gpd.read_file(path, rows=0, **options).crs),
        "selection_rule": "representative_point_inside_area; full original population",
    }
    frame = frame.loc[~unknown].copy()
    frame[population_field] = weights.loc[~unknown]
    if frame[id_field].isna().any() or frame[id_field].astype(str).duplicated().any():
        raise ValueError("Identificadores de demanda nulos o duplicados")
    lonlat = gpd.GeoSeries(frame.demand_point, crs=metric_crs).to_crs(4326)
    nodes = [
        DemandNode(
            str(row[id_field]),
            row.geometry,
            ll.y,
            ll.x,
            float(row[population_field]),
            row.demand_point,
        )
        for (_, row), ll in zip(frame.iterrows(), lonlat, strict=True)
    ]
    if not nodes:
        raise ValueError("No hay localidades con población conocida en el área")
    return sorted(nodes, key=lambda node: node.id), audit

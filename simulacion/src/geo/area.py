"""Ventanas piloto explícitas y selección de UTM local."""

import geopandas as gpd
from pyproj import CRS
from shapely.geometry import Point, box
from shapely.geometry.base import BaseGeometry

PRESETS = {
    "biobio": (-72.65, -37.30, -72.45, -37.10),
    "metropolitana": (-70.95, -33.85, -70.75, -33.65),
}


def study_area(
    region: str,
    bbox: tuple[float, ...] | None = None,
    polygon: str | None = None,
    center: tuple[float, float] | None = None,
    study_size_m: float | None = None,
) -> tuple[BaseGeometry, CRS]:
    if sum(value is not None for value in (bbox, polygon, center)) > 1:
        raise ValueError("Elegir bbox, polígono o centro/tamaño, no combinarlos")
    if (center is None) != (study_size_m is None):
        raise ValueError("center y study_size_m deben usarse juntos")
    if center:
        longitude, latitude = center
        center_point = Point(longitude, latitude)
        crs = gpd.GeoSeries([center_point], crs=4326).estimate_utm_crs()
        if crs is None:
            raise ValueError("No se pudo determinar UTM para el centro")
        metric_center = gpd.GeoSeries([center_point], crs=4326).to_crs(crs).iloc[0]
        half = study_size_m / 2
        metric_area = box(
            metric_center.x - half,
            metric_center.y - half,
            metric_center.x + half,
            metric_center.y + half,
        )
        area = gpd.GeoSeries([metric_area], crs=crs).to_crs(4326).iloc[0]
        return area, CRS(crs)
    if polygon:
        frame = gpd.read_file(polygon)
        if frame.empty or frame.crs is None:
            raise ValueError("El polígono de estudio requiere geometría y CRS")
        area = frame.to_crs(4326).geometry.union_all()
    else:
        bounds = bbox if bbox is not None else PRESETS[region]
        if len(bounds) != 4:
            raise ValueError("bbox requiere oeste sur este norte")
        west, south, east, north = bounds
        if not (-180 <= west < east <= 180 and -80 <= south < north <= 84):
            raise ValueError("bbox WGS84 inválido o fuera de la cobertura UTM")
        area = box(*bounds)
    if area.geom_type not in {"Polygon", "MultiPolygon"} or not area.is_valid:
        raise ValueError("El área debe ser un polígono válido")
    if area.is_empty or area.bounds[2] - area.bounds[0] > 6:
        raise ValueError("Elegir un área pequeña, de hasta 6 grados de longitud")
    crs = gpd.GeoSeries([area], crs=4326).estimate_utm_crs()
    if crs is None:
        raise ValueError("No se pudo determinar UTM para el área")
    return area, CRS(crs)


def project_geometry(geometry: BaseGeometry, source, target) -> BaseGeometry:
    return gpd.GeoSeries([geometry], crs=source).to_crs(target).iloc[0]

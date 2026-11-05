"""Consulta acotada de caminos OpenStreetMap para visualización."""

import json
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

OVERPASS_URLS = (
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
)
OSM_ATTRIBUTION = "© OpenStreetMap contributors"
ROAD_CLASSES = {
    "motorway",
    "trunk",
    "primary",
    "secondary",
    "tertiary",
    "unclassified",
    "residential",
    "track",
}


def roads_geojson(
    bounds: tuple[float, float, float, float], timeout: int = 120
) -> dict:
    """Descargar vías OSM dentro de un bbox WGS84 como GeoJSON."""
    west, south, east, north = bounds
    query = (
        "[out:json][timeout:60];"
        f'way[highway~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|track)$"]'
        f"({south},{west},{north},{east});out geom;"
    )
    last_error = None
    for url in OVERPASS_URLS:
        request = Request(
            url,
            data=urlencode({"data": query}).encode(),
            headers={"User-Agent": "grafos-proyecto-semestral/0.1"},
            method="POST",
        )
        try:
            with urlopen(request, timeout=timeout) as response:
                return roads_from_overpass(json.load(response))
        except (HTTPError, URLError, TimeoutError) as error:
            last_error = error
    raise RuntimeError("No se pudo descargar caminos desde Overpass") from last_error


def roads_from_overpass(payload: dict) -> dict:
    """Convertir respuesta Overpass a una colección GeoJSON estable."""
    features = []
    for element in payload.get("elements", []):
        geometry = element.get("geometry", [])
        if element.get("type") != "way" or len(geometry) < 2:
            continue
        tags = element.get("tags", {})
        highway = tags.get("highway")
        if not highway:
            continue
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "id": str(element["id"]),
                    "highway": highway,
                    "name": tags.get("name"),
                },
                "geometry": {
                    "type": "LineString",
                    "coordinates": [[point["lon"], point["lat"]] for point in geometry],
                },
            }
        )
    return {
        "type": "FeatureCollection",
        "attribution": OSM_ATTRIBUTION,
        "features": features,
    }


def roads_from_geopackage(
    path: str | Path, bounds: tuple[float, float, float, float]
) -> dict:
    """Filtrar la capa de caminos de un GeoPackage Geofabrik al área de estudio."""
    import geopandas as gpd

    roads = gpd.read_file(path, layer="gis_osm_roads_free", bbox=bounds)
    return roads_from_geodataframe(roads)


def roads_from_geodataframe(roads) -> dict:
    """Normalizar una GeoDataFrame de caminos Geofabrik a GeoJSON de visualización."""
    if roads.crs is None:
        raise ValueError("La capa de caminos OSM debe declarar CRS")
    roads = roads.to_crs(4326)
    roads = roads[
        roads["fclass"].isin(ROAD_CLASSES)
        & roads.geometry.notna()
        & roads.geometry.geom_type.isin(["LineString", "MultiLineString"])
    ]
    features = []
    for index, row in roads.iterrows():
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "id": str(row.get("osm_id", index)),
                    "highway": row["fclass"],
                    "name": row.get("name"),
                },
                "geometry": row.geometry.__geo_interface__,
            }
        )
    return {
        "type": "FeatureCollection",
        "attribution": OSM_ATTRIBUTION,
        "features": features,
    }

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


def water_geojson(
    bounds: tuple[float, float, float, float], timeout: int = 180
) -> dict:
    """Descargar cuerpos de agua OSM (natural=water) dentro de un bbox WGS84.

    Sobre un cuerpo de agua no se instala una antena: lagos, lagunas, embalses
    y riberas mapeadas entran como restricción territorial dura (ADR 0018).
    """
    west, south, east, north = bounds
    query = (
        "[out:json][timeout:120];"
        "("
        f'way["natural"="water"]({south},{west},{north},{east});'
        f'relation["natural"="water"]({south},{west},{north},{east});'
        ");out geom;"
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
                return water_from_overpass(json.load(response))
        except (HTTPError, URLError, TimeoutError) as error:
            last_error = error
    raise RuntimeError("No se pudo descargar agua desde Overpass") from last_error


def water_from_overpass(payload: dict) -> dict:
    """Convertir respuesta Overpass de agua a una colección GeoJSON estable.

    Ways cerrados: polígono directo. Relaciones (multipolígono): se reensamblan
    con polygonize sobre los miembros exteriores y se perforan con los
    interiores. Ways abiertos de agua no forman área y se ignoran.
    """
    from shapely.geometry import LineString, Polygon
    from shapely.ops import polygonize

    features = []
    for element in payload.get("elements", []):
        tags = element.get("tags") or {}
        kind = element.get("type")
        polygons = []
        if kind == "way":
            coords = [
                [point["lon"], point["lat"]] for point in element.get("geometry") or []
            ]
            if len(coords) >= 4 and coords[0] == coords[-1]:
                polygons.append(Polygon(coords))
        elif kind == "relation":
            outers, inners = [], []
            for member in element.get("members") or []:
                if member.get("type") != "way":
                    continue
                coords = [
                    [point["lon"], point["lat"]]
                    for point in member.get("geometry") or []
                ]
                if len(coords) < 4:
                    continue
                (inners if member.get("role") == "inner" else outers).append(coords)
            if outers:
                shells = list(polygonize(LineString(ring) for ring in outers))
                holes = list(polygonize(LineString(ring) for ring in inners))
                for shell in shells:
                    cuts = [
                        hole
                        for hole in holes
                        if shell.covers(hole.representative_point())
                    ]
                    polygons.append(
                        Polygon(shell.exterior, [hole.exterior for hole in cuts])
                    )
        else:
            continue
        clean = []
        for polygon in polygons:
            if not polygon.is_valid:
                polygon = polygon.buffer(0)
            if polygon.is_empty:
                continue
            if polygon.geom_type == "MultiPolygon":
                clean.extend(polygon.geoms)
            else:
                clean.append(polygon)
        for polygon in clean:
            features.append(
                {
                    "type": "Feature",
                    "properties": {
                        "id": str(element["id"]),
                        "name": tags.get("name"),
                    },
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [
                            [[x, y] for x, y, *_ in ring.coords]
                            for ring in (polygon.exterior, *polygon.interiors)
                        ],
                    },
                }
            )
    return {
        "type": "FeatureCollection",
        "attribution": OSM_ATTRIBUTION,
        "features": features,
    }

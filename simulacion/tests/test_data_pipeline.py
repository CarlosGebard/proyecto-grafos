import json
from dataclasses import replace

import geopandas as gpd
import numpy as np
import pytest
import rasterio
from rasterio.transform import from_origin
from shapely.geometry import LineString, Point, box

from src.algorithms.exact import ExactLimitExceeded
from src.config import PipelineConfig
from src.data.dem import copernicus_tiles, prepare_dem
from src.data.osm import roads_from_geodataframe, roads_from_overpass
from src.data.population import load_population
from src.geo.area import project_geometry, study_area
from src.pipeline import parse_config, run


@pytest.fixture
def study_inputs(tmp_path, dem_factory):
    # Datos artificiales sólo para tests: no se usan como fuentes del piloto.
    crs = "EPSG:32718"
    area = box(700000, 5870000, 701000, 5871000)
    points = [Point(700250, 5870250), Point(700750, 5870750)]
    frame = gpd.GeoDataFrame(
        {"ID": ["x", "y"], "HABITANTES": [10, 20]}, geometry=points, crs=crs
    )
    population = tmp_path / "population.gpkg"
    frame.to_file(population)
    dem = dem_factory(np.zeros((120, 120)), from_origin(699900, 5871100, 10, 10))
    return area, crs, population, dem


def test_population_unknown_duplicate_and_full_polygon(tmp_path):
    area = box(-73, -38, -72, -37)
    frame = gpd.GeoDataFrame(
        {"ID": [1, 2, 3], "HABITANTES": [12, -99, 0]},
        geometry=[
            box(-73.2, -37.8, -72.4, -37.2),
            Point(-72.5, -37.5),
            Point(-72.6, -37.6),
        ],
        crs=4326,
    )
    path = tmp_path / "demand.geojson"
    frame.to_file(path)
    nodes, audit = load_population(path, area, "EPSG:32718")
    assert [n.population for n in nodes] == [12, 0]
    assert audit["excluded_unknown_population"] == 1
    assert (
        nodes[0].geometry.area
        > project_geometry(
            area.intersection(frame.geometry[0]), 4326, "EPSG:32718"
        ).area
    )
    frame["ID"] = [1, 1, 1]
    frame.to_file(path)
    with pytest.raises(ValueError, match="duplicados"):
        load_population(path, area, "EPSG:32718")


def test_dem_crop_reprojection_and_limits(study_inputs, tmp_path):
    area, crs, _, dem = study_inputs
    wgs84 = project_geometry(area, crs, 4326)
    result = tmp_path / "crop.tif"
    audit = prepare_dem([dem], wgs84, crs, result)
    with rasterio.open(result) as source:
        assert source.crs.to_epsg() == 32718
        assert source.width < 120
        assert (
            np.nanmax(source.read(1)) == 0
        )  # altura cero válida si no es NoData de la fuente
    assert audit["resolution_m"] == 10
    with pytest.raises(ValueError, match="píxeles"):
        prepare_dem([dem], wgs84, crs, result, max_pixels=10)


def test_pipeline_exports_and_exact_skip(study_inputs, tmp_path):
    area, crs, population, dem = study_inputs
    bbox = project_geometry(area, crs, 4326).bounds
    config = PipelineConfig(
        bbox=bbox,
        population=str(population),
        dem=str(dem),
        output=str(tmp_path / "run"),
        k=2,
        candidate_spacing_m=250,
        max_distance_m=2000,
    )
    report = run(config)
    assert report["results"][0]["population_covered"] == 30
    assert report["results"][0]["algorithm"] == "exact"
    assert report["results"][1]["algorithm"] == "exact_connected"
    output = tmp_path / "run"
    assert {
        "dem.tif",
        "map.png",
        "metrics.json",
        "graph.json",
        "connectivity.json",
        "terrain.json",
        "manifest.json",
        "demand.geojson",
        "candidates.geojson",
        "demand_points.geojson",
        "study_area.geojson",
    } <= {p.name for p in output.iterdir()}
    graph = json.loads((output / "graph.json").read_text())
    assert graph["population"] == {"x": 10, "y": 20}
    terrain = json.loads((output / "terrain.json").read_text())
    assert terrain["width"] <= 96 and terrain["height"] <= 96
    assert terrain["bounds_metric_m"][2] > terrain["bounds_metric_m"][0]
    assert terrain["elevation_max_m"] >= terrain["elevation_min_m"]
    manifest = json.loads((output / "manifest.json").read_text())
    assert len(manifest["population"]["files"][0]["sha256"]) == 64
    assert gpd.read_file(output / "demand.geojson").crs.to_epsg() == 4326
    with pytest.raises(ValueError, match="no está vacío"):
        run(config)
    with pytest.raises(ExactLimitExceeded):
        run(replace(config, output=str(tmp_path / "skipped"), max_combinations=1))


def test_cli_config_precedence_and_area(tmp_path):
    path = tmp_path / "config.toml"
    path.write_text("k = 3\ncandidate_spacing_m = 4000.0\n")
    config = parse_config(["--config", str(path), "--k", "5"])
    assert config.k == 5 and config.candidate_spacing_m == 4000
    path.write_text("bbox = [-73, -38, -72, -37]\n")
    polygon_config = parse_config(["--config", str(path), "--polygon", "area.geojson"])
    assert polygon_config.bbox is None and polygon_config.polygon == "area.geojson"
    with pytest.raises(ValueError):
        study_area("biobio", (-72, -38, -73, -37))
    with pytest.raises(ValueError):
        PipelineConfig(candidate_spacing_m=float("nan")).validate()
    with pytest.raises(ValueError):
        PipelineConfig(k=-1).validate()


def test_roads_from_overpass_keeps_only_valid_ways():
    roads = roads_from_overpass(
        {
            "elements": [
                {
                    "type": "way",
                    "id": 17,
                    "tags": {"highway": "tertiary", "name": "Camino Rural"},
                    "geometry": [
                        {"lat": -37.2, "lon": -72.6},
                        {"lat": -37.21, "lon": -72.59},
                    ],
                },
                {"type": "way", "id": 18, "tags": {}, "geometry": []},
            ]
        }
    )
    assert roads["attribution"] == "© OpenStreetMap contributors"
    assert roads["features"][0]["geometry"]["type"] == "LineString"
    assert roads["features"][0]["properties"]["name"] == "Camino Rural"


def test_roads_from_geodataframe_keeps_supported_road_classes():
    frame = gpd.GeoDataFrame(
        {
            "osm_id": [1, 2],
            "fclass": ["primary", "footway"],
            "name": ["Ruta", "Sendero"],
        },
        geometry=[
            LineString([(-72.6, -37.2), (-72.59, -37.21)]),
            LineString([(-72.6, -37.2), (-72.58, -37.22)]),
        ],
        crs=4326,
    )
    roads = roads_from_geodataframe(frame)
    assert len(roads["features"]) == 1
    assert roads["features"][0]["properties"]["highway"] == "primary"


def test_copernicus_tile_names_and_guard(tmp_path, monkeypatch):
    calls = []

    def fake_download(url, path):
        calls.append(url)
        return path

    monkeypatch.setattr("src.data.dem.download", fake_download)
    tiles = copernicus_tiles((-70.95, -33.85, -70.75, -33.65), tmp_path)
    assert len(tiles) == 1
    assert "Copernicus_DSM_COG_10_S34_00_W071_00_DEM" in calls[0]
    with pytest.raises(ValueError):
        copernicus_tiles((-74, -38, -70, -33), tmp_path)


def test_invalid_population_is_not_silently_dropped(tmp_path):
    path = tmp_path / "bad.geojson"
    frame = gpd.GeoDataFrame(
        {"ID": [1], "HABITANTES": ["error"]}, geometry=[Point(-72.5, -37.5)], crs=4326
    )
    frame.to_file(path)
    with pytest.raises(ValueError, match="no numéricos"):
        load_population(path, box(-73, -38, -72, -37), "EPSG:32718")


def test_dem_source_zero_nodata_is_preserved(dem_factory, tmp_path):
    from src.geo.elevation import ElevationModel

    values = np.full((100, 100), 50.0)
    values[:, :50] = 0
    source = dem_factory(values, from_origin(700000, 5871000, 10, 10), nodata=0)
    area = project_geometry(box(700100, 5870100, 700900, 5870900), 32718, 4326)
    result = tmp_path / "nodata-crop.tif"
    prepare_dem([source], area, "EPSG:32718", result)
    dem = ElevationModel(result)
    elevations = dem.sample([(700200, 5870500), (700800, 5870500)])
    assert np.isnan(elevations[0])
    assert elevations[1] == 50


def test_geographic_dem_and_multiple_tiles(dem_factory, tmp_path):
    from src.geo.elevation import ElevationModel

    west = dem_factory(
        np.full((100, 100), 25),
        from_origin(-72.51, -37.49, 0.0001, 0.0001),
        crs="EPSG:4326",
    )
    east = dem_factory(
        np.full((100, 100), 50),
        from_origin(-72.50, -37.49, 0.0001, 0.0001),
        crs="EPSG:4326",
    )
    area = box(-72.509, -37.499, -72.491, -37.491)
    result = tmp_path / "mosaic.tif"
    prepare_dem([west, east], area, "EPSG:32718", result)
    dem = ElevationModel(result)
    locations = [
        project_geometry(Point(x, -37.495), 4326, 32718) for x in (-72.505, -72.495)
    ]
    assert dem.sample([(p.x, p.y) for p in locations]).tolist() == [25, 50]

import geopandas as gpd
import numpy as np
import pytest
from shapely.geometry import Point, Polygon, box

from src.geo.area import project_geometry, study_area
from src.geo.candidates import generate_candidates
from src.geo.constraints import apply_prc_constraints, load_prc_constraints
from src.geo.coverage import compute_connectivity, compute_coverage
from src.geo.elevation import ElevationModel
from src.geo.line_of_sight import has_line_of_sight
from src.graph.models import AntennaCandidate, DemandNode


def test_flat_ridge_antenna_and_receiver_height(flat_dem, dem_factory):
    assert has_line_of_sight(flat_dem, (5, 55), (95, 55))
    ridge = np.zeros((10, 10))
    ridge[:, 5] = 40
    dem = ElevationModel(dem_factory(ridge))
    assert not has_line_of_sight(dem, (5, 55), (95, 55), 30, 1.5)
    assert has_line_of_sight(dem, (5, 55), (95, 55), 100, 100)
    assert has_line_of_sight(dem, (5, 55), (95, 55), 30, 100)


def test_nodata_endpoints_interior_and_outside(dem_factory, flat_dem):
    values = np.zeros((10, 10))
    values[:, 5] = -9999
    dem = ElevationModel(dem_factory(values))
    assert not has_line_of_sight(dem, (5, 55), (95, 55))
    assert not has_line_of_sight(dem, (55, 55), (95, 55))
    assert not has_line_of_sight(dem, (5, 55), (55, 55))
    assert not has_line_of_sight(flat_dem, (-5, 55), (95, 55))
    assert has_line_of_sight(flat_dem, (5, 55), (5, 55))
    assert np.isnan(flat_dem.sample([(100, 55), (5, 0)])).all()


def test_sample_resolution_and_invalid_parameters(flat_dem):
    with pytest.raises(ValueError):
        has_line_of_sight(flat_dem, (5, 55), (95, 55), sample_step_m=10)
    with pytest.raises(ValueError):
        has_line_of_sight(flat_dem, (5, 55), (95, 55), antenna_height_m=-1)


def test_candidates_holes_nodata_and_reproducibility(flat_dem, dem_factory):
    area = Polygon(
        [(1, 1), (99, 1), (99, 99), (1, 99)],
        holes=[[(40, 40), (60, 40), (60, 60), (40, 60)]],
    )
    candidates, audit = generate_candidates(area, flat_dem, 10)
    assert len(candidates) == 80
    assert all(area.covers(a.point) for a in candidates)
    assert candidates == generate_candidates(area, flat_dem, 10)[0]
    assert audit["excluded_nodata"] == 0
    with pytest.raises(ValueError):
        generate_candidates(area, flat_dem, 1, max_candidates=100)
    values = np.full((10, 10), -9999)
    dem = ElevationModel(dem_factory(values))
    assert generate_candidates(area, dem, 10)[0] == []


def test_coverage_distance_boundary_and_injected_model(flat_dem):
    a = AntennaCandidate("a", 0, 0, 0, Point(10, 50))
    demands = [
        DemandNode(str(x), Point(x, 50), 0, 0, 1, Point(x, 50)) for x in (30, 40, 41)
    ]
    graph, audit = compute_coverage([a], demands, flat_dem, 30, 30, 1.5)
    assert graph == {"a": {"30", "40"}}
    assert audit["los_checks"] == 2
    assert compute_coverage(
        [a], demands, flat_dem, 30, 30, 1.5, visibility=lambda *args: False
    )[0] == {"a": set()}
    with pytest.raises(ValueError):
        compute_coverage([a], demands, flat_dem, 30, 30, 1.5, max_pairs=2)


def test_connectivity_is_undirected_and_respects_distance(flat_dem):
    candidates = [
        AntennaCandidate("a", 0, 0, 0, Point(10, 50)),
        AntennaCandidate("b", 0, 0, 0, Point(40, 50)),
        AntennaCandidate("c", 0, 0, 0, Point(90, 50)),
    ]
    links, audit = compute_connectivity(candidates, flat_dem, 35, 30)
    assert links == {"a": {"b"}, "b": {"a"}, "c": set()}
    assert audit["num_pairs"] == 3
    assert audit["num_edges"] == 1
    with pytest.raises(ValueError):
        compute_connectivity(candidates, flat_dem, 35, 30, max_pairs=2)


def test_dem_rejects_geographic_units(dem_factory):
    with pytest.raises(ValueError, match="métrico"):
        ElevationModel(dem_factory(np.zeros((10, 10)), crs="EPSG:4326"))


def test_candidates_empty_window(flat_dem):
    assert generate_candidates(box(1, 1, 2, 2), flat_dem, 100)[0] == []


def test_prc_hard_exclusions_and_screening_mode(tmp_path, flat_dem):
    path = tmp_path / "prc.geojson"
    gpd.GeoDataFrame(
        {"ZONA": ["AV", "ZH1"], "NOMBRE": ["Área verde", "Habitacional"]},
        geometry=[box(0, 0, 20, 100), box(20, 0, 100, 100)],
        crs="EPSG:32718",
    ).to_crs(4326).to_file(path, driver="GeoJSON")
    area = box(0, 0, 100, 100)
    area_wgs84 = gpd.GeoSeries([area], crs="EPSG:32718").to_crs(4326).iloc[0]
    constraints, forbidden = load_prc_constraints(tmp_path, area_wgs84, "EPSG:32718")
    candidates = [
        AntennaCandidate("excluded", 0, 0, 0, Point(10, 50)),
        AntennaCandidate("unknown", 0, 0, 0, Point(50, 50)),
    ]
    kept, excluded, audit = apply_prc_constraints(
        candidates, constraints, forbidden, "screening"
    )
    assert [candidate.id for candidate in kept] == ["unknown"]
    assert [candidate.id for candidate in excluded] == ["excluded"]
    assert kept[0].constraint_status == "unknown"
    assert audit["excluded"] == 1


def test_center_area_has_metric_requested_size():
    area, crs = study_area(
        "biobio", center=(-72.556409, -37.127679), study_size_m=50_000
    )
    metric = project_geometry(area, 4326, crs)
    assert metric.bounds[2] - metric.bounds[0] == pytest.approx(50_000, abs=0.1)
    assert metric.bounds[3] - metric.bounds[1] == pytest.approx(50_000, abs=0.1)

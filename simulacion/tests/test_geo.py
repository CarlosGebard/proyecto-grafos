import numpy as np
import pytest
from shapely.geometry import Point, Polygon, box

from src.geo.candidates import generate_candidates
from src.geo.coverage import compute_coverage
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


def test_dem_rejects_geographic_units(dem_factory):
    with pytest.raises(ValueError, match="métrico"):
        ElevationModel(dem_factory(np.zeros((10, 10)), crs="EPSG:4326"))


def test_candidates_empty_window(flat_dem):
    assert generate_candidates(box(1, 1, 2, 2), flat_dem, 100)[0] == []

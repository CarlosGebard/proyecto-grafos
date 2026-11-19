import json
import math

import geopandas as gpd
import numpy as np
import pytest
from shapely.geometry import Point, Polygon, box, shape

from src.data.osm import water_from_overpass
from src.geo.area import project_geometry, study_area
from src.geo.candidates import generate_candidates
from src.geo.constraints import (
    apply_prc_constraints,
    apply_sensitive_constraints,
    apply_water_constraints,
    load_prc_constraints,
    load_sensitive_sites,
    load_water_constraints,
)
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


def test_criterion_intersections_reproducibility_and_area(flat_dem, dem_factory):
    area = Polygon(
        [(1, 1), (99, 1), (99, 99), (1, 99)],
        holes=[[(40, 40), (60, 40), (60, 60), (40, 60)]],
    )
    demands = [
        DemandNode("d1", None, 0, 0, 5.0, Point(35, 55)),
        DemandNode("d2", None, 0, 0, 3.0, Point(70, 55)),
    ]
    candidates, audit = generate_candidates(
        area, flat_dem, demands, [30.0], max_candidates=10_000, separation_m=5.0
    )
    ids = {candidate.id for candidate in candidates}
    assert "d_d1" in ids and "d_d2" in ids
    # Intersección Murray-Tong exacta: círculos r=30 en (35,55) y (70,55);
    # d=35, base=(52.5,55), h=sqrt(900-306,25).
    height = math.sqrt(900 - 17.5**2)
    for y in (55 + height, 55 - height):
        assert any(
            abs(candidate.point.x - 52.5) < 1e-9 and abs(candidate.point.y - y) < 1e-9
            for candidate in candidates
        )
    assert audit["circle_intersections"] == 2
    assert all(area.covers(candidate.point) for candidate in candidates)
    repeat, repeat_audit = generate_candidates(
        area, flat_dem, demands, [30.0], max_candidates=10_000, separation_m=5.0
    )
    assert candidates == repeat and audit == repeat_audit
    assert audit["excluded_nodata"] == 0


def test_criterion_cap_is_scored_and_deterministic(flat_dem):
    area = box(1, 1, 99, 99)
    demands = [
        DemandNode("d1", None, 0, 0, 5.0, Point(35, 55)),
        DemandNode("d2", None, 0, 0, 3.0, Point(70, 55)),
    ]
    candidates, audit = generate_candidates(
        area, flat_dem, demands, [30.0], max_candidates=3, separation_m=5.0
    )
    assert len(candidates) == 3 and audit["capped"] is True
    # Los puntos de intersección cubren ambas demandas a distancia: puntúan 8
    # y sobreviven al tope antes que el ancla de menor población.
    ids = {candidate.id for candidate in candidates}
    assert "d_d1" in ids and "d_d2" not in ids
    assert (
        candidates
        == generate_candidates(
            area, flat_dem, demands, [30.0], max_candidates=3, separation_m=5.0
        )[0]
    )


def test_criterion_rejects_steep_slope(flat_dem, dem_factory):
    ramp = np.tile(np.arange(10) * 10.0, (10, 1))  # 45 grados con píxel de 10 m
    dem = ElevationModel(dem_factory(ramp))
    demands = [DemandNode("d1", None, 0, 0, 5.0, Point(35, 55))]
    candidates, audit = generate_candidates(
        box(1, 1, 99, 99), dem, demands, [30.0], max_candidates=10_000, separation_m=5.0
    )
    assert candidates == []
    assert audit["excluded_slope"] == audit["raw_points"]
    with pytest.raises(ValueError):
        generate_candidates(box(1, 1, 99, 99), dem, demands, [30.0], max_slope_deg=95.0)


def test_criterion_highsites_reach_terrain_peaks(flat_dem, dem_factory):
    peak = np.zeros((10, 10))
    peak[3, 4] = 100.0
    dem = ElevationModel(dem_factory(peak))
    candidates, audit = generate_candidates(
        box(1, 1, 99, 99),
        dem,
        [DemandNode("d1", None, 0, 0, 5.0, Point(35, 55))],
        [30.0],
        max_candidates=10_000,
        highsite_window_m=40.0,
        separation_m=5.0,
    )
    tops = [
        candidate
        for candidate in candidates
        if candidate.id.startswith("h_") and abs(candidate.elevation - 100.0) < 1e-9
    ]
    assert len(tops) == 1
    assert abs(tops[0].point.x - 45) < 1e-9 and abs(tops[0].point.y - 65) < 1e-9
    assert audit["highsites"] >= 1


def test_criterion_nodata_window_yields_no_candidates(flat_dem, dem_factory):
    area = box(1, 1, 99, 99)
    demands = [DemandNode("d1", None, 0, 0, 5.0, Point(35, 55))]
    dem = ElevationModel(dem_factory(np.full((10, 10), -9999)))
    candidates, audit = generate_candidates(
        area, dem, demands, [30.0], max_candidates=10_000, separation_m=5.0
    )
    assert candidates == []
    assert audit["excluded_nodata"] == audit["raw_points"]
    assert (
        generate_candidates(
            box(1, 1, 2, 2), flat_dem, demands, [30.0], separation_m=5.0
        )[0]
        == []
    )


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


def test_per_candidate_radius_in_coverage_and_connectivity(flat_dem):
    corto = AntennaCandidate("corto", 0, 0, 0, Point(10, 50), radius_m=30)
    largo = AntennaCandidate("largo", 0, 0, 0, Point(70, 50), radius_m=45)
    demands = [DemandNode("d1", Point(40, 50), 0, 0, 5, Point(40, 50))]
    graph, audit = compute_coverage([corto, largo], demands, flat_dem, 45, 30, 1.5)
    assert graph == {"corto": {"d1"}, "largo": {"d1"}}
    assert audit["los_checks"] == 2
    # Radio de clase menor que la distancia: sin cobertura aunque el default alcance.
    corto_corto = AntennaCandidate("corto", 0, 0, 0, Point(10, 50), radius_m=29)
    assert compute_coverage([corto_corto], demands, flat_dem, 45, 30, 1.5)[0] == {
        "corto": set()
    }
    # Enlace exige que ambas antenas alcancen la distancia: min(ρu, ρv).
    a = AntennaCandidate("a", 0, 0, 0, Point(10, 50), radius_m=20)
    b = AntennaCandidate("b", 0, 0, 0, Point(40, 50), radius_m=45)
    c = AntennaCandidate("c", 0, 0, 0, Point(70, 50), radius_m=45)
    links, audit = compute_connectivity([a, b, c], flat_dem, 45, 30)
    assert links == {"a": set(), "b": {"c"}, "c": {"b"}}
    assert audit["num_edges"] == 1


def test_dem_rejects_geographic_units(dem_factory):
    with pytest.raises(ValueError, match="métrico"):
        ElevationModel(dem_factory(np.zeros((10, 10)), crs="EPSG:4326"))


def test_criterion_invalid_parameters(flat_dem):
    demands = [DemandNode("d1", None, 0, 0, 5.0, Point(50, 50))]
    area = box(1, 1, 99, 99)
    with pytest.raises(ValueError):
        generate_candidates(area, flat_dem, demands, [])
    with pytest.raises(ValueError):
        generate_candidates(
            area, flat_dem, demands, [30.0], highsite_window_m=0.0, separation_m=5.0
        )
    with pytest.raises(ValueError):
        generate_candidates(area, flat_dem, demands, [-1.0])
    with pytest.raises(ValueError):
        generate_candidates(area, flat_dem, demands, [30.0], separation_m=0.0)


def test_criterion_proximity_filter_avoids_duplicates(flat_dem):
    # Máximos de planicie cada ~20 m (ventana 40 m): sin filtro de proximidad
    # el tope se llenaría de puntos casi duplicados del mismo clúster.
    candidates, audit = generate_candidates(
        box(1, 1, 99, 99),
        flat_dem,
        [DemandNode("d1", None, 0, 0, 5.0, Point(50, 50))],
        [30.0],
        max_candidates=10_000,
        highsite_window_m=40.0,
        separation_m=30.0,
    )
    assert len(candidates) > 1
    assert audit["excluded_proximity"] > 0
    points = np.array([[c.point.x, c.point.y] for c in candidates])
    distancias = np.linalg.norm(points[:, None, :] - points[None, :, :], axis=2)
    np.fill_diagonal(distancias, np.inf)
    assert (distancias >= 30.0).all()


def test_sensitive_sites_buffer_and_loading(tmp_path, flat_dem):
    _, audit_gen = generate_candidates(
        box(1, 1, 99, 99),
        flat_dem,
        [
            DemandNode("d1", None, 0, 0, 5.0, Point(50, 50)),
            DemandNode("d2", None, 0, 0, 5.0, Point(95, 5)),
        ],
        [30.0],
        max_candidates=10_000,
        highsite_window_m=20.0,
        separation_m=15.0,
    )
    assert audit_gen["demand_anchors"] == 2
    candidatos = [
        AntennaCandidate("d_escuela", 0, 0, 10.0, Point(50, 50)),
        AntennaCandidate("d_lejos", 0, 0, 10.0, Point(95, 5)),
    ]
    # Torre de 30 m: buffer de 4x altura = 120 m; ambos puntos quedan dentro.
    kept, excluded, audit = apply_sensitive_constraints(
        candidatos, Point(50, 50), 120.0
    )
    assert kept == []
    assert {candidate.id for candidate in excluded} == {"d_escuela", "d_lejos"}
    assert audit["buffer_m"] == 120.0
    # Con buffer de 50 m sólo sobrevive el punto a 63,6 m del establecimiento.
    kept_far, _, _ = apply_sensitive_constraints(candidatos, Point(50, 50), 50.0)
    assert [candidate.id for candidate in kept_far] == ["d_lejos"]
    kept_none, _, audit_none = apply_sensitive_constraints(candidatos, None, 120.0)
    assert len(kept_none) == 2
    assert "capa no disponible" in audit_none["source"]
    frame = gpd.GeoDataFrame(
        {"NOMBRE": ["Escuela"]}, geometry=[Point(50, 50)], crs="EPSG:32718"
    )
    frame.to_file(tmp_path / "escuela.geojson", driver="GeoJSON")
    area_wgs84 = project_geometry(box(1, 1, 99, 99), "EPSG:32718", 4326)
    geometry = load_sensitive_sites(tmp_path, area_wgs84, "EPSG:32718")
    assert geometry is not None and geometry.covers(Point(50, 50))
    with pytest.raises(ValueError):
        load_sensitive_sites(tmp_path / "vacio", area_wgs84, "EPSG:32718")


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


def test_water_constraints_exclude_points_inside_polygons():
    """Agua (ADR 0018): sin antena sobre lagos, embalses o riberas."""
    lago = Polygon([(10, 10), (40, 10), (40, 40), (10, 40)])
    candidatos = [
        AntennaCandidate("en_lago", 0, 0, 0, Point(20, 20)),
        AntennaCandidate("en_orilla", 0, 0, 0, Point(40, 25)),
        AntennaCandidate("en_tierra", 0, 0, 0, Point(60, 60)),
    ]
    kept, excluded, audit = apply_water_constraints(candidatos, lago)
    assert [candidate.id for candidate in kept] == ["en_tierra"]
    assert [candidate.id for candidate in excluded] == ["en_lago", "en_orilla"]
    assert all(candidate.constraint_rule == "water_body" for candidate in excluded)
    assert audit["excluded"] == 2
    assert audit["kept"] == 1
    kept_none, _, audit_none = apply_water_constraints(candidatos, None)
    assert len(kept_none) == 3
    assert audit_none["excluded"] == 0


def test_water_from_overpass_assembles_ways_relations_and_snapshot(tmp_path):
    closed_ring = [
        {"lat": -33.90, "lon": -70.90},
        {"lat": -33.90, "lon": -70.80},
        {"lat": -34.00, "lon": -70.80},
        {"lat": -34.00, "lon": -70.90},
        {"lat": -33.90, "lon": -70.90},
    ]
    hole_ring = [
        {"lat": -33.94, "lon": -70.87},
        {"lat": -33.94, "lon": -70.84},
        {"lat": -33.97, "lon": -70.84},
        {"lat": -33.97, "lon": -70.87},
        {"lat": -33.94, "lon": -70.87},
    ]
    payload = {
        "elements": [
            {
                "type": "way",
                "id": 1,
                "tags": {"name": "Laguna", "natural": "water"},
                "geometry": closed_ring,
            },
            {
                "type": "relation",
                "id": 2,
                "tags": {"natural": "water"},
                "members": [
                    {"type": "way", "role": "outer", "geometry": closed_ring},
                    {"type": "way", "role": "inner", "geometry": hole_ring},
                ],
            },
            {
                "type": "way",
                "id": 3,
                "tags": {"natural": "water"},
                "geometry": [
                    {"lat": 0.0, "lon": 0.0},
                    {"lat": 0.0, "lon": 1.0},
                ],
            },
        ]
    }
    collection = water_from_overpass(payload)
    # El way abierto no forma área; way cerrado + relación reensamblada.
    assert len(collection["features"]) == 2
    lake = shape(collection["features"][0]["geometry"])
    assert lake.covers(Point(-70.85, -33.95))
    relation = shape(collection["features"][1]["geometry"])
    assert len(relation.interiors) == 1
    assert not relation.covers(Point(-70.855, -33.955))

    path = tmp_path / "agua.geojson"
    (tmp_path / "agua.geojson").write_text(
        json.dumps(collection, ensure_ascii=False), encoding="utf-8"
    )
    area_wgs84 = gpd.GeoSeries([box(-70.95, -34.05, -70.75, -33.85)], crs=4326).iloc[0]
    geometry, snapshot = load_water_constraints(str(path), area_wgs84, "EPSG:32718")
    assert geometry is not None
    punto = project_geometry(Point(-70.85, -33.95), 4326, "EPSG:32718")
    assert geometry.covers(punto)
    assert len(snapshot["features"]) == 2
    assert snapshot["attribution"].startswith("© OpenStreetMap")
    with pytest.raises(ValueError):
        load_water_constraints(
            str(tmp_path / "ausente.geojson"), area_wgs84, "EPSG:32718"
        )


def test_center_area_has_metric_requested_size():
    area, crs = study_area(
        "biobio", center=(-72.556409, -37.127679), study_size_m=50_000
    )
    metric = project_geometry(area, 4326, crs)
    assert metric.bounds[2] - metric.bounds[0] == pytest.approx(50_000, abs=0.1)
    assert metric.bounds[3] - metric.bounds[1] == pytest.approx(50_000, abs=0.1)

"""Ejecutar con python -m src.pipeline --help."""

import argparse
import json
import logging
import platform
import sys
import tomllib
from dataclasses import asdict, replace
from datetime import datetime, timezone
from importlib.metadata import version
from pathlib import Path
from time import perf_counter

from src.algorithms.connected import (
    greedy_conectado,
    min_antenas_para_objetivo,
    resolver,
)
from src.config import AntennaClass, PipelineConfig
from src.data.dem import copernicus_tiles, prepare_dem
from src.data.osm import OSM_ATTRIBUTION, roads_from_geopackage, roads_geojson
from src.data.population import load_population
from src.data.prepare import SUBDERE_PAGE, fingerprint, prepare_alos, prepare_population
from src.evaluation.metrics import metrics
from src.geo.area import project_geometry, study_area
from src.geo.candidates import generate_candidates
from src.geo.constraints import (
    apply_prc_constraints,
    apply_sensitive_constraints,
    load_prc_constraints,
    load_sensitive_sites,
)
from src.geo.coverage import compute_connectivity, compute_coverage
from src.geo.elevation import ElevationModel
from src.graph.builder import build_graph
from src.visualization.map import export_map
from src.visualization.terrain import terrain_payload

LOG = logging.getLogger(__name__)


def asignar_radios(candidates, classes, default_radius_m: float):
    """Adjunta el radio efectivo por clase de potencia a cada candidato.

    Determinista: candidatos ordenados por id, clases en el orden declarado del
    TOML; los excedentes usan el radio por defecto (max_distance_m).
    """
    if not classes:
        return candidates, None
    resto = sorted(candidates, key=lambda candidate: candidate.id)
    radios = {}
    for clase in classes:
        if clase.count > len(resto):
            raise ValueError(
                f"Clase '{clase.name}' pide {clase.count} candidatos;"
                f" sólo quedan {len(resto)}"
            )
        for candidate in resto[: clase.count]:
            radios[candidate.id] = clase.radius_m
        resto = resto[clase.count :]
    for candidate in resto:
        radios[candidate.id] = default_radius_m
    audit = {
        "classes": {clase.name: clase.count for clase in classes},
        "default_radius_candidates": len(resto),
        "default_radius_m": default_radius_m,
    }
    return [
        replace(candidate, radius_m=radios[candidate.id]) for candidate in candidates
    ], audit


def write_json(path: Path, value, *, compact: bool = False) -> None:
    if compact:
        path.write_text(
            json.dumps(
                value, ensure_ascii=False, separators=(",", ":"), allow_nan=False
            )
            + "\n",
            encoding="utf-8",
        )
        return
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n",
        encoding="utf-8",
    )


def run(config: PipelineConfig) -> dict:
    started = perf_counter()
    config.validate()
    area, crs = study_area(
        config.region,
        config.bbox,
        config.polygon,
        config.center,
        config.study_size_m,
    )
    output = Path(config.output)
    # No mezclar resultados de parámetros diferentes ni sobrescribir entradas.
    if output.exists() and any(output.iterdir()):
        raise ValueError(
            f"El directorio de salida no está vacío: {output}. Elegir otro --output"
        )
    output.mkdir(parents=True, exist_ok=True)
    data_dir = Path(config.data_dir)
    timings = {}
    step = perf_counter()
    population_path = (
        Path(config.population)
        if config.population
        else prepare_population(data_dir, config.download_population)
    )
    demands, population_audit = load_population(
        population_path,
        area,
        crs,
        config.population_field,
        config.id_field,
        config.layer,
    )
    timings["population"] = perf_counter() - step
    LOG.info(
        "1. %s localidades cargadas; %s excluidas por población desconocida",
        len(demands),
        population_audit["excluded_unknown_population"],
    )

    step = perf_counter()
    if config.dem:
        sources = [Path(config.dem)]
        dem_label = "user_provided"
    elif config.dem_source == "copernicus":
        sources = copernicus_tiles(area.bounds, data_dir / "downloads/copernicus")
        dem_label = "Copernicus GLO-30 public 2021"
    else:
        if config.region != "biobio" and config.bbox is None and config.polygon is None:
            raise ValueError(
                "Sólo hay ALOS local de Biobío. Usar --dem para ALOS de otra región o --dem-source copernicus"
            )
        sources = [prepare_alos(data_dir)]
        dem_label = "ALOS PALSAR Biobío / CIREN-IDE Chile (archivo local)"
    dem_path = output / "dem.tif"
    dem_audit = prepare_dem(
        sources, area, crs, dem_path, config.dem_resolution_m, config.max_dem_pixels
    )
    dem = ElevationModel(dem_path)
    if config.sample_step_m is not None and config.sample_step_m > dem.resolution_m / 2:
        raise ValueError("sample_step_m no puede superar medio píxel del DEM")
    timings["dem"] = perf_counter() - step
    LOG.info(
        "2. DEM preparado en %s, resolución %.2f m", crs.to_string(), dem.resolution_m
    )

    step = perf_counter()
    metric_area = project_geometry(area, 4326, crs)
    generation_radii = sorted(
        {clase.radius_m for clase in config.antenna_classes} | {config.max_distance_m}
    )
    all_candidates, candidate_audit = generate_candidates(
        metric_area,
        dem,
        demands,
        generation_radii,
        max_candidates=config.max_candidates,
        highsite_window_m=config.highsite_window_m,
        max_slope_deg=config.max_slope_deg,
        separation_m=config.candidate_separation_m,
    )
    constraints = None
    prc_audit = None
    sensitive_audit = None
    candidates = all_candidates
    excluded_candidates = []
    if config.prc_directory:
        constraints, excluded_geometry = load_prc_constraints(
            config.prc_directory, area, crs
        )
        candidates, prc_excluded, prc_audit = apply_prc_constraints(
            all_candidates, constraints, excluded_geometry, config.prc_mode
        )
        excluded_candidates.extend(prc_excluded)
        constraints.to_crs(4326).to_file(
            output / "constraints.geojson", driver="GeoJSON"
        )
        LOG.info(
            "3. PRC: %s candidatos válidos; %s excluidos",
            len(candidates),
            len(prc_excluded),
        )
    if config.sensitive_directory:
        sensitive_geometry = load_sensitive_sites(config.sensitive_directory, area, crs)
        candidates, sensitive_excluded, sensitive_audit = apply_sensitive_constraints(
            candidates,
            sensitive_geometry,
            max(4 * config.antenna_height_m, 50.0),
        )
        excluded_candidates.extend(sensitive_excluded)
        LOG.info(
            "3b. Establecimientos sensibles: %s excluidos (buffer %.0f m)",
            len(sensitive_excluded),
            max(4 * config.antenna_height_m, 50.0),
        )
    all_candidates = [*candidates, *excluded_candidates]
    if not candidates:
        raise ValueError(
            "No hay candidatos válidos tras restricciones territoriales"
            " (PRC / establecimientos sensibles); revisar capas o modos"
        )
    timings["candidates"] = perf_counter() - step
    LOG.info("3. %s candidatos generados", len(candidates))
    candidates, radii_audit = asignar_radios(
        candidates, config.antenna_classes, config.max_distance_m
    )
    if radii_audit:
        LOG.info(
            "3b. Clases de potencia: %s; %s candidatos con radio por defecto",
            radii_audit["classes"],
            radii_audit["default_radius_candidates"],
        )
    step = perf_counter()
    coverage, coverage_audit = compute_coverage(
        candidates,
        demands,
        dem,
        config.max_distance_m,
        config.antenna_height_m,
        config.receiver_height_m,
        config.sample_step_m,
        config.max_pairs,
    )
    graph = build_graph(candidates, demands, coverage)
    timings["coverage_graph"] = perf_counter() - step
    LOG.info("4. Grafo calculado: %s aristas", coverage_audit["num_edges"])
    step = perf_counter()
    connectivity, connectivity_audit = compute_connectivity(
        candidates,
        dem,
        config.max_distance_m,
        config.antenna_height_m,
        config.sample_step_m,
        config.max_pairs,
    )
    timings["connectivity_graph"] = perf_counter() - step
    LOG.info("5. Enlaces entre antenas: %s", connectivity_audit["num_edges"])
    gateways = set(config.gateways) if config.gateways else None
    exact_solution = resolver(graph, None, config.k, budget=config.max_evaluations)
    connected_solution = resolver(
        graph, connectivity, config.k, gateways=gateways, budget=config.max_evaluations
    )
    greedy_solution = greedy_conectado(graph, connectivity, config.k, gateways=gateways)
    LOG.info("6. Exacto: %.0f habitantes cubiertos", exact_solution.population_covered)
    LOG.info(
        "7. Exacto conectado: %.0f habitantes cubiertos",
        connected_solution.population_covered,
    )
    LOG.info(
        "7b. Goloso conectado: %.0f habitantes (razón %.3f vs exacto)",
        greedy_solution.population_covered,
        greedy_solution.population_covered / connected_solution.population_covered
        if connected_solution.population_covered
        else 0.0,
    )
    report = {
        "results": [
            metrics(graph, exact_solution, config.k),
            metrics(graph, connected_solution, config.k),
            metrics(graph, greedy_solution, config.k),
        ],
        "exact": {"status": "completed"},
        "exact_connected": {"status": "completed"},
        "greedy_connected": {"status": "completed"},
    }
    if config.min_population is not None:
        decision = min_antenas_para_objetivo(
            graph,
            connectivity,
            config.k,
            config.min_population,
            gateways=gateways,
            budget=config.max_evaluations,
        )
        report["threshold"] = {
            "min_population": config.min_population,
            "min_antennas": decision[0] if decision else None,
            "solution": metrics(graph, decision[1], decision[0]) if decision else None,
        }
        LOG.info(
            "7c. Umbral %.0f habitantes: %s",
            config.min_population,
            f"{decision[0]} antenas" if decision else "inalcanzable con k antenas",
        )
    write_json(
        output / "graph.json",
        {
            "coverage": {a: sorted(d) for a, d in graph.coverage.items()},
            "population": graph.population,
        },
    )
    write_json(output / "metrics.json", report)
    write_json(
        output / "connectivity.json",
        {candidate: sorted(neighbors) for candidate, neighbors in connectivity.items()},
    )
    LOG.info("8. Métricas y conectividad exportadas")
    osm_audit = None
    if config.osm_roads or config.download_osm_roads:
        step = perf_counter()
        roads = (
            roads_from_geopackage(config.osm_roads, area.bounds)
            if config.osm_roads
            else roads_geojson(area.bounds)
        )
        write_json(output / "roads.geojson", roads)
        timings["osm_roads"] = perf_counter() - step
        osm_audit = {
            "source": (
                "OpenStreetMap Geofabrik GeoPackage"
                if config.osm_roads
                else "OpenStreetMap via Overpass API"
            ),
            "attribution": OSM_ATTRIBUTION,
            "num_features": len(roads["features"]),
        }
        LOG.info("9. Caminos OSM exportados: %s", osm_audit["num_features"])
    step = perf_counter()
    export_map(
        demands,
        all_candidates,
        exact_solution,
        crs,
        metric_area,
        output,
        dem_path,
        config.hypsometric_palette,
        excluded_candidates,
    )
    timings["visualization"] = perf_counter() - step
    step = perf_counter()
    write_json(
        output / "terrain.json",
        terrain_payload(dem_path, config.hypsometric_palette),
        compact=True,
    )
    timings["terrain_export"] = perf_counter() - step
    manifest = {
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "config": asdict(config),
        "study_bounds_wgs84": list(area.bounds),
        "metric_crs": crs.to_string(),
        "timings_seconds": timings,
        "population": {
            "source": SUBDERE_PAGE if config.population is None else "user_provided",
            **population_audit,
            **fingerprint(population_path),
        },
        "dem": {
            "dataset": dem_label,
            **dem_audit,
            "inputs": [fingerprint(path) for path in sources],
        },
        "candidates": candidate_audit,
        "antenna_classes": radii_audit,
        "prc_constraints": prc_audit,
        "sensitive_sites": sensitive_audit,
        "coverage": coverage_audit,
        "connectivity": connectivity_audit,
        "osm_roads": osm_audit,
        "model": {
            "name": "distance_and_sampled_los",
            "sample_step_m": config.sample_step_m or dem.resolution_m / 2,
            "nodata_policy": "no_coverage",
            "map_algorithm": "exact",
            "limitations": [
                "One interior point represents each full locality",
                "No curvature, Fresnel, diffraction or radio link budget",
                "Connected antennas do not imply Internet access or network capacity",
                "Unknown population excluded, not estimated",
            ],
        },
        "versions": {
            name: version(name)
            for name in [
                "numpy",
                "geopandas",
                "rasterio",
                "shapely",
                "pyproj",
                "matplotlib",
            ]
        },
        "python": platform.python_version(),
    }
    manifest["pipeline_runtime_seconds"] = perf_counter() - started
    write_json(output / "manifest.json", manifest)
    LOG.info("10. Mapa y resultados: %s", output)
    return report


def parse_config(argv=None) -> PipelineConfig:
    parser = argparse.ArgumentParser(
        description="Pipeline de la propuesta: DEM + población → grafo → maximum coverage"
    )
    parser.add_argument(
        "--config", type=Path, help="Archivo TOML; los argumentos CLI tienen prioridad"
    )
    parser.add_argument(
        "--region",
        choices=["biobio", "metropolitana"],
        help="Ventana piloto pequeña, no región administrativa completa",
    )
    area = parser.add_mutually_exclusive_group()
    area.add_argument(
        "--bbox", type=float, nargs=4, metavar=("WEST", "SOUTH", "EAST", "NORTH")
    )
    area.add_argument(
        "--polygon", help="Archivo vectorial con CRS y polígono de estudio"
    )
    parser.add_argument("--k", type=int)
    parser.add_argument("--min-population", type=float, help="Umbral t de población")
    parser.add_argument(
        "--gateways", nargs="+", help="Ids de candidatos con salida a Internet"
    )
    for flag, dest in [
        ("max-distance", "max_distance_m"),
        ("antenna-height", "antenna_height_m"),
        ("receiver-height", "receiver_height_m"),
        ("sample-step", "sample_step_m"),
        ("dem-resolution", "dem_resolution_m"),
        ("max-slope-deg", "max_slope_deg"),
        ("highsite-window", "highsite_window_m"),
        ("candidate-separation", "candidate_separation_m"),
    ]:
        parser.add_argument(f"--{flag}", dest=dest, type=float)
    parser.add_argument("--dem-source", choices=["alos", "copernicus"])
    for flag in [
        "dem",
        "population",
        "osm-roads",
        "prc-directory",
        "sensitive-directory",
        "population-field",
        "id-field",
        "layer",
        "data-dir",
        "output",
    ]:
        parser.add_argument(f"--{flag}")
    parser.add_argument("--center", nargs=2, type=float, metavar=("LON", "LAT"))
    parser.add_argument("--study-size-m", type=float)
    parser.add_argument("--prc-mode", choices=["screening", "strict"])
    parser.add_argument("--download-population", action="store_true", default=None)
    parser.add_argument("--download-osm-roads", action="store_true", default=None)
    for flag in ["max-evaluations", "max-candidates", "max-pairs", "max-dem-pixels"]:
        parser.add_argument(f"--{flag}", type=int)
    args = vars(parser.parse_args(argv))
    config_path = args.pop("config")
    values = {}
    if config_path:
        with config_path.open("rb") as stream:
            values = tomllib.load(stream)
        if "antenna_class" in values:
            values["antenna_classes"] = tuple(
                AntennaClass(**tabla) for tabla in values.pop("antenna_class")
            )
    if args.get("polygon") is not None:
        values.pop("bbox", None)
    if args.get("bbox") is not None:
        values.pop("polygon", None)
    values.update({key: value for key, value in args.items() if value is not None})
    if "bbox" in values:
        values["bbox"] = tuple(values["bbox"])
    if "center" in values:
        values["center"] = tuple(values["center"])
    return PipelineConfig(**values)


def main(argv=None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    try:
        run(parse_config(argv))
    except (ValueError, TypeError, OSError, RuntimeError) as error:
        LOG.error("Error: %s", error)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

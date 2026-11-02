"""Ejecutar con python -m src.pipeline --help."""

import argparse
import json
import logging
import platform
import sys
import tomllib
from dataclasses import asdict
from datetime import datetime, timezone
from importlib.metadata import version
from pathlib import Path
from time import perf_counter

from src.algorithms.exact import exact
from src.config import PipelineConfig
from src.data.dem import copernicus_tiles, prepare_dem
from src.data.population import load_population
from src.data.prepare import SUBDERE_PAGE, fingerprint, prepare_alos, prepare_population
from src.evaluation.metrics import metrics
from src.geo.area import project_geometry, study_area
from src.geo.candidates import generate_candidates
from src.geo.coverage import compute_coverage
from src.geo.elevation import ElevationModel
from src.graph.builder import build_graph
from src.visualization.map import export_map

LOG = logging.getLogger(__name__)


def write_json(path: Path, value) -> None:
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n",
        encoding="utf-8",
    )


def run(config: PipelineConfig) -> dict:
    started = perf_counter()
    config.validate()
    area, crs = study_area(config.region, config.bbox, config.polygon)
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
    candidates, candidate_audit = generate_candidates(
        metric_area, dem, config.candidate_spacing_m, config.max_candidates
    )
    if not candidates:
        raise ValueError(
            "No hay candidatos válidos: reducir spacing o revisar el DEM/área"
        )
    timings["candidates"] = perf_counter() - step
    LOG.info("3. %s candidatos generados", len(candidates))
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
    exact_solution = exact(graph, config.k, config.max_combinations)
    LOG.info("5. Exacto: %.0f habitantes cubiertos", exact_solution.population_covered)
    report = {
        "results": [metrics(graph, exact_solution, config.k)],
        "exact": {"status": "completed"},
    }
    write_json(
        output / "graph.json",
        {
            "coverage": {a: sorted(d) for a, d in graph.coverage.items()},
            "population": graph.population,
        },
    )
    write_json(output / "metrics.json", report)
    LOG.info("6. Métricas exportadas")
    step = perf_counter()
    export_map(demands, candidates, exact_solution, crs, metric_area, output)
    timings["visualization"] = perf_counter() - step
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
        "coverage": coverage_audit,
        "model": {
            "name": "distance_and_sampled_los",
            "sample_step_m": config.sample_step_m or dem.resolution_m / 2,
            "nodata_policy": "no_coverage",
            "map_algorithm": "exact",
            "limitations": [
                "One interior point represents each full locality",
                "No curvature, Fresnel, diffraction or radio link budget",
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
    LOG.info("7. Mapa y resultados: %s", output)
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
    for flag, dest in [
        ("candidate-spacing", "candidate_spacing_m"),
        ("max-distance", "max_distance_m"),
        ("antenna-height", "antenna_height_m"),
        ("receiver-height", "receiver_height_m"),
        ("sample-step", "sample_step_m"),
        ("dem-resolution", "dem_resolution_m"),
    ]:
        parser.add_argument(f"--{flag}", dest=dest, type=float)
    parser.add_argument("--dem-source", choices=["alos", "copernicus"])
    for flag in [
        "dem",
        "population",
        "population-field",
        "id-field",
        "layer",
        "data-dir",
        "output",
    ]:
        parser.add_argument(f"--{flag}")
    parser.add_argument("--download-population", action="store_true", default=None)
    for flag in ["max-combinations", "max-candidates", "max-pairs", "max-dem-pixels"]:
        parser.add_argument(f"--{flag}", type=int)
    args = vars(parser.parse_args(argv))
    config_path = args.pop("config")
    values = {}
    if config_path:
        with config_path.open("rb") as stream:
            values = tomllib.load(stream)
    if args.get("polygon") is not None:
        values.pop("bbox", None)
    if args.get("bbox") is not None:
        values.pop("polygon", None)
    values.update({key: value for key, value in args.items() if value is not None})
    if "bbox" in values:
        values["bbox"] = tuple(values["bbox"])
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

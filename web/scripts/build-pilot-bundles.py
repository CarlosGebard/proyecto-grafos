#!/usr/bin/env python3
"""Genera los paquetes de simulación (pilotos reales del repositorio
proyecto-grafos) para el visor Next.js: salida en public/data/pilots/*.json."""

import json
import math
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]  # raíz del repositorio
SRC = REPO / "simulacion" / "outputs"
DST = Path(__file__).resolve().parents[1] / "public" / "data" / "pilots"
DST.mkdir(parents=True, exist_ok=True)

ZONES = {
    "biobio": "biobio",
    "metropolitana": "metropolitana",
    "yumbel": "yumbel-criterio",
}


def restrictions_for(src_id: str, man: dict, rej_count: int | None) -> list[dict]:
    cfg = man.get("config", {})
    cov = man.get("coverage") or {}
    prc = man.get("prc_constraints")
    classes = man.get("antenna_classes")
    west, south, east, north = man["study_bounds_wgs84"]
    lat_mid = (south + north) / 2
    km_w = (east - west) * 111.32 * math.cos(math.radians(lat_mid))
    km_h = (north - south) * 110.57
    items = [
        {
            "title": "Área de estudio",
            "value": f"{km_w:.0f} × {km_h:.0f} km",
            "body": "Sólo los puntos dentro de la ventana entran al criterio de candidatos.",
            "count": "C₀ = { p : p ∈ A }",
        },
        {
            "title": "DEM sin datos (NoData)",
            "value": (man.get("dem") or {}).get("dataset", "Copernicus GLO-30"),
            "body": "Una celda sin elevación no genera cobertura ni LOS (política no_coverage).",
            "count": "z(p) = NoData → p ∉ C₁",
        },
        {
            "title": "Pendiente (constructibilidad)",
            "value": "θ_máx = 30°",
            "body": "Sin sitios de antena en laderas más empinadas que el umbral.",
            "count": "C₁ = { p ∈ C₀ : |∇z(p)| ≤ tan θ_máx }",
        },
    ]
    sep = cfg.get("candidate_separation_m")
    if sep:
        items.append({
            "title": "Separación de candidatos",
            "value": f"{sep/1000:.0f} km",
            "body": "Distancia mínima entre sitios propuestos por el criterio territorial.",
            "count": "|pᵢ − pⱼ| ≥ d_min",
        })
    items.append({
        "title": "Cobertura y línea de vista",
        "value": f"{cov.get('num_pairs', 0):,} pares · {cov.get('num_edges', 0):,} enlaces".replace(",", "."),
        "body": "Cada localidad queda cubierta si cae dentro del radio de una antena con línea de vista sobre el relieve real.",
        "count": "d ∈ C(a) ⟺ dist(d,a) ≤ ρ(a) ∧ LOS(d,a)",
    })
    if classes:
        c = classes["classes"]
        res = " · ".join(f"{k}: ρ={v/1000:.0f} km" for k, v in c.items())
        items.append({
            "title": "Clases de potencia",
            "value": res,
            "body": "La potencia de cada antena define su radio efectivo; los enlaces usan min(ρu, ρv).",
            "count": "ρ_eff(u,v) = min(ρu, ρv)",
        })
    if prc:
        items.append({
            "title": "PRC — screening territorial",
            "value": f"{prc.get('generated', 0)} generadas · {prc.get('excluded', 0)} excluidas",
            "body": prc.get("source", "Screening territorial, no permiso de construcción."),
            "count": "C_PRC = Cₙ ∖ E_PRC",
        })
    if rej_count:
        items.append({
            "title": "Rechazos del criterio",
            "value": f"{rej_count:,} puntos descartados".replace(",", "."),
            "body": "Sitios propuestos que no superaron los filtros del criterio (pendiente, separación, sensibilidad).",
            "count": "R = C₀ ∖ Cₙ",
        })
    return items


for out_id, src_id in ZONES.items():
    d = SRC / src_id
    metrics = json.load(open(d / "metrics.json"))
    man = json.load(open(d / "manifest.json"))
    graph = json.load(open(d / "graph.json"))
    conn = json.load(open(d / "connectivity.json"))
    demands = json.load(open(d / "demand_points.geojson"))["features"]
    cands = json.load(open(d / "candidates.geojson"))["features"]
    try:
        rej_count = len(json.load(open(d / "candidate_rejections.geojson"))["features"])
    except Exception:
        rej_count = None

    exact_conn = next(r for r in metrics["results"] if r["algorithm"] == "exact_connected")
    selected_ids = set(exact_conn["selected"])

    # demand points: compacto [lon, lat, pop, status]
    status_map = {"covered": 2, "reachable": 1, "unreachable": 0}
    localities = []
    demand_index = {}
    for i, f in enumerate(demands):
        p = f["properties"]
        demand_index[p["id"]] = i
        lon, lat = f["geometry"]["coordinates"]
        localities.append([
            round(lon, 5), round(lat, 5),
            int(p["population"]),
            status_map.get(p.get("status", "unreachable"), 0),
        ])

    # candidatos: [lon, lat, radius_m, seleccionado]
    candidates = []
    cand_index = {}
    for i, f in enumerate(cands):
        p = f["properties"]
        cand_index[p["id"]] = i
        lon, lat = f["geometry"]["coordinates"]
        candidates.append([
            round(lon, 5), round(lat, 5),
            int(p.get("radius_m") or 0),
            1 if p["id"] in selected_ids else 0,
        ])

    # adyacencia completa entre candidatos (índices, i<j)
    conn_edges = []
    for a, neighbors in conn.items():
        for b in neighbors:
            i, j = cand_index[a], cand_index[b]
            if i < j:
                conn_edges.append([i, j])

    # aristas de cobertura: [índice candidato, índice localidad]
    coverage = graph["coverage"]
    coverage_edges = []
    for cid, dids in coverage.items():
        ci = cand_index[cid]
        for did in dids:
            di = demand_index.get(did)
            if di is not None:
                coverage_edges.append([ci, di])

    by_status = exact_conn.get("localities_by_status") or {}
    if not by_status:
        by_status = {"covered": 0, "reachable": 0, "unreachable": 0}
        for l in localities:
            key = {0: "unreachable", 1: "reachable", 2: "covered"}[l[3]]
            by_status[key] += 1

    cfg = man.get("config", {})
    cov = man.get("coverage") or {}
    bundle = {
        "id": out_id,
        "bounds": man["study_bounds_wgs84"],
        "metrics": {
            "k": exact_conn["k"],
            "numCandidates": exact_conn["num_candidates"],
            "numDemandNodes": exact_conn["num_demand_nodes"],
            "populationTotal": exact_conn["population_total"],
            "populationCovered": exact_conn["population_covered"],
            "coveragePct": exact_conn["coverage_percentage"],
            "populationReachable": exact_conn.get("population_uncovered_reachable", 0),
            "populationUnreachable": exact_conn.get("population_unreachable", 0),
            "runtimeSeconds": exact_conn.get("runtime_seconds"),
            "evaluations": exact_conn.get("evaluations"),
            "byStatus": by_status,
            "minPopulation": cfg.get("min_population"),
            "maxSlopeDeg": cfg.get("max_slope_deg"),
            "candidateSeparationM": cfg.get("candidate_separation_m"),
            "losPairs": cov.get("num_pairs"),
            "coverageEdgesCount": cov.get("num_edges"),
            "rejections": rej_count,
            "prcMode": (man.get("prc_constraints") or {}).get("mode"),
        },
        "localities": localities,
        "candidates": candidates,
        "connEdges": conn_edges,
        "coverageEdges": coverage_edges,
        "restrictions": restrictions_for(src_id, man, rej_count),
    }

    out = DST / f"{out_id}.json"
    json.dump(bundle, open(out, "w"), ensure_ascii=False, separators=(",", ":"))
    print(out, f"{out.stat().st_size/1024:.0f} KB",
          f"loc={len(localities)} cand={len(candidates)} conn={len(conn_edges)} cov={len(coverage_edges)}")

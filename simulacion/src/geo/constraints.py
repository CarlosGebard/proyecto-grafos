"""Restricciones territoriales explícitas provenientes de capas PRC."""

from dataclasses import replace
from pathlib import Path

import geopandas as gpd
import pandas as pd

EXCLUDED_ZONES = {"agua", "av", "zpd", "zri", "zeh-2(c)"}
EXCLUDED_TERMS = (
    "area verde",
    "área verde",
    "inund",
    "drenaje",
    "riesgo",
    "no edificable",
)


def load_prc_constraints(directory: str | Path, area_wgs84, metric_crs):
    """Cargar exclusiones inequívocas PRC que intersectan el área de estudio."""
    directory = Path(directory)
    paths = sorted(directory.glob("*.geojson"))
    if not paths:
        raise ValueError(f"No hay GeoJSON PRC en {directory}")
    records = []
    for path in paths:
        frame = gpd.read_file(path, bbox=gpd.GeoSeries([area_wgs84], crs=4326))
        if frame.empty or frame.crs is None:
            continue
        frame = frame.loc[
            frame.geometry.notna()
            & ~frame.geometry.is_empty
            & frame.geom_type.isin(["Polygon", "MultiPolygon"])
        ].to_crs(metric_crs)
        for _, row in frame.iterrows():
            zone = str(row.get("ZONA", "")).strip()
            name = str(row.get("NOMBRE", "")).strip()
            text = f"{zone} {name}".lower()
            excluded = zone.lower() in EXCLUDED_ZONES or any(
                term in text for term in EXCLUDED_TERMS
            )
            records.append(
                {
                    "prc_zone": zone or None,
                    "prc_name": name or None,
                    "constraint_status": "excluded" if excluded else "unknown",
                    "constraint_rule": "prc_hard_exclusion"
                    if excluded
                    else "prc_unclassified",
                    "source_file": path.name,
                    "geometry": row.geometry,
                }
            )
    constraints = gpd.GeoDataFrame(records, crs=metric_crs)
    if constraints.empty:
        return constraints, None
    excluded = constraints.loc[constraints.constraint_status == "excluded"]
    return constraints, (excluded.geometry.union_all() if not excluded.empty else None)


def load_sensitive_sites(directory: str | Path, area_wgs84, metric_crs):
    """Cargar establecimientos sensibles (OGUC 116 bis E, Ley 20.599).

    Escuelas, salas cuna, hospitales, hogares de ancianos y similares como
    puntos o polígonos. Sin capa declarada, la corrida igual es válida: la
    restricción queda como limitación de datos, no como permiso.
    """
    directory = Path(directory)
    paths = sorted(directory.glob("*.geojson"))
    if not paths:
        raise ValueError(f"No hay GeoJSON de establecimientos sensibles en {directory}")
    frames = []
    for path in paths:
        frame = gpd.read_file(path, bbox=gpd.GeoSeries([area_wgs84], crs=4326))
        if frame.empty or frame.crs is None:
            continue
        frame = frame.loc[
            frame.geometry.notna()
            & ~frame.geometry.is_empty
            & frame.geom_type.isin(["Point", "Polygon", "MultiPolygon"])
        ].to_crs(metric_crs)
        if not frame.empty:
            frames.append(frame)
    if not frames:
        return None
    return pd.concat(frames, ignore_index=True).geometry.union_all()


def apply_sensitive_constraints(candidates, geometry, buffer_m: float):
    """Excluir candidatos dentro de establecimientos sensibles o su entorno.

    Regla OGUC 116 bis E / Ley 20.599: no instalable en el establecimiento ni
    a menos de 4 veces la altura de la torre (mínimo 50 m) de sus deslindes.
    """
    kept, excluded = [], []
    if geometry is not None:
        exclusion = geometry.buffer(buffer_m)
        for candidate in candidates:
            if exclusion.covers(candidate.point):
                excluded.append(
                    replace(
                        candidate,
                        constraint_status="excluded",
                        constraint_rule="sensitive_site_distance",
                    )
                )
                continue
            kept.append(candidate)
    else:
        kept = list(candidates)
    audit = {
        "mode": "sensitive_buffer",
        "rule": "OGUC 116 bis E / Ley 20.599: torre > 12 m fuera de establecimientos"
        " sensibles y a >= max(4x altura, 50 m) de sus deslindes",
        "buffer_m": buffer_m,
        "source": "capa declarada por config"
        if geometry is not None
        else "capa no disponible: limitación de datos declarada, no autorización",
        "generated": len(candidates),
        "kept": len(kept),
        "excluded": len(excluded),
    }
    return kept, excluded, audit


def apply_prc_constraints(candidates, constraints, excluded_geometry, mode: str):
    """Etiquetar candidatos y retirar sólo exclusiones duras del modelo."""
    kept, excluded = [], []
    reasons = {}
    if constraints is not None and not constraints.empty:
        for _, row in constraints.loc[
            constraints.constraint_status == "excluded"
        ].iterrows():
            reasons.setdefault(
                row.prc_zone or row.prc_name or "PRC", row.constraint_rule
            )
    for candidate in candidates:
        if excluded_geometry is not None and excluded_geometry.covers(candidate.point):
            item = replace(
                candidate,
                constraint_status="excluded",
                constraint_rule="prc_hard_exclusion",
            )
            excluded.append(item)
        else:
            item = replace(
                candidate,
                constraint_status="unknown",
                constraint_rule="prc_unclassified",
            )
            if mode == "strict":
                excluded.append(item)
            else:
                kept.append(item)
    audit = {
        "mode": mode,
        "source": "PRC municipal: screening territorial, no permiso de construcción",
        "generated": len(candidates),
        "kept": len(kept),
        "excluded": len(excluded),
        "exclusion_rules": reasons,
    }
    return kept, excluded, audit

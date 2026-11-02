"""Figuras del informe, derivadas exclusivamente de los pilotos exportados.

Ejecutar desde la raíz: .venv/bin/python docs/report/generate_figures.py
"""

import json
import math
import os
from pathlib import Path

os.environ.setdefault("MPLCONFIGDIR", "/tmp/grafos-matplotlib")

import geopandas as gpd
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import rasterio
from matplotlib.colors import LightSource, LinearSegmentedColormap, ListedColormap
from matplotlib.lines import Line2D
from matplotlib.ticker import FuncFormatter

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "output/pdf"
FIG = OUT / "figures"
FIG.mkdir(parents=True, exist_ok=True)
INK, TEAL, ORANGE, GRAY = "#163040", "#008b80", "#d37838", "#768992"
plt.rcParams.update(
    {
        "font.family": "DejaVu Sans",
        "font.size": 9,
        "axes.labelcolor": INK,
        "text.color": INK,
        "axes.edgecolor": "#bbc8ca",
        "xtick.color": GRAY,
        "ytick.color": GRAY,
        "axes.spines.top": False,
        "axes.spines.right": False,
        "savefig.facecolor": "white",
        "pdf.fonttype": 42,
    }
)


def read(region):
    base = ROOT / f"outputs/{region}-exacto"
    m = json.loads((base / "metrics.json").read_text())
    manifest = json.loads((base / "manifest.json").read_text())
    crs = manifest["metric_crs"]
    return {
        "base": base,
        "metrics": m,
        "manifest": manifest,
        "graph": json.loads((base / "graph.json").read_text()),
        **{
            key: gpd.read_file(base / f"{name}.geojson").to_crs(crs)
            for key, name in [
                ("demand", "demand"),
                ("points", "demand_points"),
                ("antennas", "candidates"),
                ("area", "study_area"),
            ]
        },
    }


DATA = {region: read(region) for region in ["biobio", "metropolitana"]}


def terrain(ax, data, dark=False):
    with rasterio.open(data["base"] / "dem.tif") as raster:
        ratio = min(1, 1000 / max(raster.shape))
        h, w = round(raster.height * ratio), round(raster.width * ratio)
        values = raster.read(1, out_shape=(h, w), masked=True).filled(np.nan)
        values = np.nan_to_num(values, nan=np.nanmedian(values))
        bounds = raster.bounds
        palette = (
            ["#0c2633", "#164e59", "#417c7b", "#a4c4b5"]
            if dark
            else ["#e7eeeb", "#cbd8cd", "#8fa79a", "#647e75"]
        )
        cmap = LinearSegmentedColormap.from_list("terrain", palette)
        rgb = LightSource(azdeg=315, altdeg=40).shade(
            values,
            cmap=cmap,
            vert_exag=1.5,
            dx=raster.res[0] / ratio,
            dy=raster.res[1] / ratio,
            blend_mode="soft",
        )
        ax.imshow(
            rgb,
            extent=[bounds.left, bounds.right, bounds.bottom, bounds.top],
            rasterized=True,
        )
    left, bottom, right, top = data["area"].total_bounds
    ax.set_xlim(left, right)
    ax.set_ylim(bottom, top)
    ax.set_aspect("equal")
    return left, bottom, right, top


def map_figure(region):
    data = DATA[region]
    fig, ax = plt.subplots(figsize=(7.0, 6.35), layout="constrained")
    left, bottom, right, top = terrain(ax, data)
    data["demand"].boundary.plot(ax=ax, color="#6e8a80", linewidth=0.35, alpha=0.5)
    points = data["points"]
    for covered, color in [(False, ORANGE), (True, TEAL)]:
        subset = points[points.covered == covered]
        ax.scatter(
            subset.geometry.x,
            subset.geometry.y,
            s=8 + subset.population * 0.12,
            c=color,
            alpha=0.82,
            edgecolor="white",
            linewidth=0.45,
            zorder=3,
        )
    antennas = data["antennas"]
    ax.scatter(
        antennas.geometry.x,
        antennas.geometry.y,
        marker="+",
        color=INK,
        s=48,
        linewidth=1,
        zorder=4,
    )
    selected = antennas[antennas.selected]
    ax.scatter(
        selected.geometry.x,
        selected.geometry.y,
        marker="*",
        color=INK,
        s=220,
        edgecolor="white",
        linewidth=0.9,
        zorder=5,
    )
    order = data["metrics"]["results"][0]["selected"]
    for _, row in selected.iterrows():
        ax.annotate(
            str(order.index(row.id) + 1),
            (row.geometry.x, row.geometry.y),
            xytext=(9, 6),
            textcoords="offset points",
            weight="bold",
            fontsize=9,
            bbox={
                "boxstyle": "round,pad=.15",
                "fc": "white",
                "ec": "none",
                "alpha": 0.9,
            },
            zorder=6,
        )
    data["area"].boundary.plot(ax=ax, color=INK, linewidth=1, zorder=2)
    # Barra de escala métrica y norte de cuadrícula UTM.
    x, y = left + 0.07 * (right - left), bottom + 0.05 * (top - bottom)
    ax.plot([x, x + 5000], [y, y], color=INK, lw=3)
    ax.text(
        x + 2500,
        y + 300,
        "5 km",
        ha="center",
        fontsize=8,
        bbox={"fc": "white", "ec": "none", "alpha": 0.8, "pad": 1},
    )
    ax.annotate(
        "N",
        xy=(0.955, 0.94),
        xytext=(0.955, 0.87),
        xycoords="axes fraction",
        ha="center",
        va="center",
        fontsize=9,
        weight="bold",
        arrowprops={"arrowstyle": "-|>", "color": INK},
    )
    ax.xaxis.set_major_formatter(
        FuncFormatter(lambda value, pos: f"{value / 1000:.0f}")
    )
    ax.yaxis.set_major_formatter(
        FuncFormatter(lambda value, pos: f"{value / 1000:.0f}")
    )
    ax.set_xlabel("Este UTM (km)")
    ax.set_ylabel("Norte UTM (km)")
    handles = [
        Line2D(
            [],
            [],
            marker="o",
            color="none",
            markerfacecolor=TEAL,
            markeredgecolor="white",
            markersize=7,
            label="Cubierta",
        ),
        Line2D(
            [],
            [],
            marker="o",
            color="none",
            markerfacecolor=ORANGE,
            markeredgecolor="white",
            markersize=7,
            label="Sin cobertura",
        ),
        Line2D([], [], marker="+", color=INK, linestyle="none", label="Candidato"),
        Line2D(
            [],
            [],
            marker="*",
            color=INK,
            linestyle="none",
            markersize=10,
            label="Seleccionada",
        ),
    ]
    ax.legend(
        handles=handles,
        loc="upper center",
        bbox_to_anchor=(0.5, -0.09),
        ncol=4,
        frameon=False,
        fontsize=8,
        columnspacing=1.2,
    )
    fig.savefig(FIG / f"map_{region}.pdf", bbox_inches="tight", dpi=180)
    plt.close(fig)


def cover():
    data = DATA["biobio"]
    fig, ax = plt.subplots(figsize=(8.5, 4.4))
    fig.subplots_adjust(0, 0, 1, 1)
    left, bottom, right, top = terrain(ax, data, dark=True)
    half_height = (right - left) / (8.5 / 4.4) / 2
    center = (bottom + top) / 2
    ax.set_ylim(center - half_height, center + half_height)
    # Recorte central de portada que conserva la escala en ambos ejes.
    points = data["points"]
    antennas = data["antennas"].set_index("id")
    point_index = points.set_index("id")
    for a in data["metrics"]["results"][0]["selected"]:
        start = antennas.loc[a].geometry
        for d in data["graph"]["coverage"][a]:
            end = point_index.loc[d].geometry
            ax.plot(
                [start.x, end.x], [start.y, end.y], color="#8dd9c4", alpha=0.35, lw=0.6
            )
        ax.scatter(start.x, start.y, marker="*", s=170, color="#fff0c5", zorder=4)
    ax.scatter(
        points.geometry.x,
        points.geometry.y,
        s=6 + points.population * 0.04,
        color="#dcece1",
        alpha=0.8,
        linewidth=0,
    )
    ax.axis("off")
    fig.savefig(FIG / "cover.png", dpi=220, bbox_inches="tight", pad_inches=0)
    plt.close(fig)


def overview():
    fig, axes = plt.subplots(1, 2, figsize=(7.1, 3.5), layout="constrained")
    for ax, (region, data) in zip(axes, DATA.items(), strict=True):
        terrain(ax, data)
        pts = data["points"]
        ax.scatter(
            pts.geometry.x,
            pts.geometry.y,
            s=3 + pts.population * 0.02,
            c=INK,
            alpha=0.65,
            linewidth=0,
        )
        ax.set_title(
            "Biobío · ALOS 12,5 m" if region == "biobio" else "Metropolitana · GLO-30",
            loc="left",
            fontsize=10,
            weight="bold",
        )
        ax.set_xticks([])
        ax.set_yticks([])
        for spine in ax.spines.values():
            spine.set_visible(False)
    fig.savefig(FIG / "overview.pdf", dpi=180, bbox_inches="tight")
    plt.close(fig)


def profiles():
    data = DATA["biobio"]
    with rasterio.open(data["base"] / "dem.tif") as raster:
        values = raster.read(1)
        transform = ~raster.transform
        resolution = raster.res[0]

    def sample(xy):
        cols = np.floor(transform.a * xy[:, 0] + transform.c).astype(int)
        rows = np.floor(transform.e * xy[:, 1] + transform.f).astype(int)
        return values[rows, cols]

    options = {True: [], False: []}
    for _, a in data["antennas"].iterrows():
        for _, d in data["points"].iterrows():
            start = np.array([a.geometry.x, a.geometry.y])
            end = np.array([d.geometry.x, d.geometry.y])
            distance = np.linalg.norm(end - start)
            if not 4000 < distance < 14000:
                continue
            t = np.linspace(0, 1, math.ceil(distance / (resolution / 2)) + 1)
            ground = sample(start + t[:, None] * (end - start))
            line = (ground[0] + 30) * (1 - t) + (ground[-1] + 1.5) * t
            blocked = ground[1:-1] - line[1:-1]
            covered = d.id in data["graph"]["coverage"][a.id]
            assert covered == bool(np.all(blocked <= 1e-9))
            options[covered].append(
                (float(np.max(blocked)), distance, a.id, d.id, t, ground, line)
            )
    chosen = [
        min(options[True], key=lambda p: p[0]),
        max(options[False], key=lambda p: p[0]),
    ]
    fig, axes = plt.subplots(2, 1, figsize=(7.1, 5.0), layout="constrained")
    details = []
    for ax, profile, label, color in zip(
        axes,
        chosen,
        ["ENLACE VISIBLE", "ENLACE BLOQUEADO"],
        [TEAL, ORANGE],
        strict=True,
    ):
        obstruction, distance, a, d, t, ground, line = profile
        x = t * distance / 1000
        floor = min(ground.min(), line.min()) - 10
        ax.fill_between(x, floor, ground, color="#d4dfd7")
        ax.plot(x, ground, color="#687f72", lw=0.9, label="Terreno DEM")
        ax.plot(x, line, color=color, lw=1.6, label="Línea visual")
        ax.vlines(
            [0, x[-1]], [ground[0], ground[-1]], [line[0], line[-1]], colors=INK, lw=2
        )
        if obstruction > 0:
            idx = np.argmax((ground - line)[1:-1]) + 1
            ax.scatter(x[idx], ground[idx], c=ORANGE, s=28, zorder=4)
            ax.annotate(
                f"Obstáculo: +{obstruction:.1f} m",
                (x[idx], ground[idx]),
                xytext=(5, 8),
                textcoords="offset points",
                fontsize=8,
                color=ORANGE,
            )
        ax.set(
            xlabel="Distancia desde la antena (km)",
            ylabel="Elevación DEM (m)",
            ylim=(floor, max(ground.max(), line.max()) + 25),
        )
        ax.set_title(
            f"{label}   |   {a} → localidad {d}",
            fontsize=9,
            loc="left",
            weight="bold",
            color=color,
        )
        ax.legend(loc="upper right", fontsize=7, frameon=False)
        details.append(
            {
                "antenna": a,
                "demand": d,
                "distance_m": distance,
                "max_obstruction_m": obstruction,
            }
        )
    fig.savefig(FIG / "los_profiles.pdf", bbox_inches="tight")
    plt.close(fig)
    return details


def matrix_and_gains():
    data = DATA["biobio"]
    graph, metrics = data["graph"], data["metrics"]["results"][0]
    selected = metrics["selected"]
    antennas = selected + sorted(set(graph["coverage"]) - set(selected))
    demands = sorted(graph["population"], key=lambda d: (-graph["population"][d], d))
    matrix = np.array(
        [[int(d in graph["coverage"][a]) for d in demands] for a in antennas]
    )
    assert matrix.sum() == data["manifest"]["coverage"]["num_edges"]
    fig, ax = plt.subplots(figsize=(7.1, 3.5), layout="constrained")
    ax.imshow(
        matrix,
        cmap=ListedColormap(["#edf2ef", TEAL]),
        aspect="auto",
        interpolation="nearest",
    )
    ax.axhline(len(selected) - 0.5, color=ORANGE, lw=1.5)
    ax.set_yticks(
        range(len(antennas)),
        [a.replace("a_", "") + ("  ★" if a in selected else "") for a in antennas],
        fontsize=6.8,
    )
    ax.set_xticks([0, 19, 39, 59, 81], [1, 20, 40, 60, 82])
    ax.set_xlabel("82 localidades, ordenadas de mayor a menor población")
    ax.set_ylabel("20 candidatos · índice de grilla UTM")
    fig.savefig(FIG / "matrix.pdf", bbox_inches="tight")
    plt.close(fig)
    covered, gains = set(), []
    for a in selected:
        newly = set(graph["coverage"][a]) - covered
        gains.append(sum(graph["population"][d] for d in newly))
        covered.update(newly)
    assert sum(gains) == metrics["population_covered"]
    fig, ax = plt.subplots(figsize=(7.1, 1.65), layout="constrained")
    bars = ax.bar(
        range(1, 6),
        gains,
        width=0.6,
        color=[INK, TEAL, "#45a89a", "#80c3b4", "#b9dcd0"],
    )
    ax.bar_label(
        bars,
        labels=[f"{x:,.0f}".replace(",", ".") for x in gains],
        padding=3,
        fontsize=9,
    )
    ax.set_xticks(range(1, 6), [f"Antena {i}" for i in range(1, 6)])
    ax.set_ylim(0, max(gains) * 1.28)
    ax.set_ylabel("Habitantes nuevos")
    fig.savefig(FIG / "contributions.pdf", bbox_inches="tight")
    plt.close(fig)
    return gains


def comparison():
    fig, ax = plt.subplots(figsize=(7.1, 2.9), layout="constrained")
    labels, values = [], []
    for name, data in DATA.items():
        result = data["metrics"]["results"][0]
        labels.append("Biobío" if name == "biobio" else "Metropolitana")
        values.append(result["coverage_percentage"])
    ax.barh(range(2), values, color=[TEAL, INK], height=0.58)
    ax.barh(
        range(2), [100 - v for v in values], left=values, color="#edf2ef", height=0.58
    )
    for i, value in enumerate(values):
        ax.text(
            value - 1.3,
            i,
            f"{value:.2f}%".replace(".", ","),
            va="center",
            ha="right",
            color="white",
            weight="bold",
            fontsize=10,
        )
    ax.set_yticks(range(2), labels)
    ax.invert_yaxis()
    ax.set_xlim(0, 100)
    ax.set_xlabel("Población conocida cubierta (%)")
    ax.set_xticks([0, 25, 50, 75, 100])
    fig.savefig(FIG / "comparison.pdf", bbox_inches="tight")
    plt.close(fig)


def main():
    cover()
    overview()
    for region in DATA:
        map_figure(region)
    profile_data = profiles()
    gains = matrix_and_gains()
    comparison()

    def number(value, decimals=0):
        return (
            f"{value:,.{decimals}f}".replace(",", "X")
            .replace(".", ",")
            .replace("X", ".")
        )

    commands = []
    for prefix, data in zip(["Bio", "RM"], DATA.values(), strict=True):
        exact = data["metrics"]["results"][0]
        for suffix, value in [
            ("Total", number(exact["population_total"])),
            ("Exact", number(exact["population_covered"])),
            ("ExactTime", number(exact["runtime_seconds"] * 1000, 3)),
            ("TotalTime", number(data["manifest"]["pipeline_runtime_seconds"], 2)),
        ]:
            commands.append(f"\\newcommand{{\\{prefix}{suffix}}}{{{value}}}")
    (OUT / "metrics.tex").write_text("\n".join(commands) + "\n")
    (OUT / "figure_data.json").write_text(
        json.dumps(
            {
                "los_examples": profile_data,
                "biobio_exact_contributions": gains,
                "source_runs": [
                    "outputs/biobio-exacto",
                    "outputs/metropolitana-exacto",
                ],
            },
            indent=2,
        )
    )
    print("Figuras verificadas y generadas en", FIG)


if __name__ == "__main__":
    main()

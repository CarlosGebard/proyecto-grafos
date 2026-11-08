"""Tintas hipsométricas cross-blended (Patterson & Jenny 2011, CP69).

Valores verificados contra tidyterra `cross_blended_hypsometric_tints_db`
(data-raw/cross_blended_hypsometric_tints_db.R, paletas arid/warm_humid/
cold_humid; límites en metros sobre el nivel del mar). Sin dependencias de
matplotlib: config y terrain pueden importar este módulo con coste mínimo.

La rampa se recorta al rango real de la instancia: una rampa 0-7000 m sobre
una ventana de 0-900 m desperdiciaría casi todo el cromatismo.
"""

from __future__ import annotations

ARID: list[tuple[int, str]] = [
    (0, "#A0988D"),
    (50, "#AAA096"),
    (200, "#B4AA9E"),
    (600, "#CABEAE"),
    (1000, "#D4C9B4"),
    (2000, "#D4B8A3"),
    (3000, "#D4C1B3"),
    (4000, "#D4CFCC"),
    (5000, "#DCDCDC"),
    (6000, "#EBEBED"),
    (7000, "#F5F5F5"),
]
WARM_HUMID: list[tuple[int, str]] = [
    (0, "#72A48D"),
    (50, "#78AC95"),
    (200, "#86B89F"),
    (600, "#A9C0A6"),
    (1000, "#D4C9B4"),
    (2000, "#D4B8A3"),
    (3000, "#D4C1B3"),
    (4000, "#D4CFCC"),
    (5000, "#DCDCDC"),
    (6000, "#EBEBED"),
    (7000, "#F5F5F5"),
]
COLD_HUMID: list[tuple[int, str]] = [
    (0, "#789F98"),
    (50, "#82A59F"),
    (200, "#91B1AB"),
    (600, "#B4C0B4"),
    (1000, "#D4C9B4"),
    (2000, "#D4B8A3"),
    (3000, "#D4C1B3"),
    (4000, "#D4CFCC"),
    (5000, "#DCDCDC"),
    (6000, "#EBEBED"),
    (7000, "#F5F5F5"),
]

PALETTES: dict[str, list[tuple[int, str]]] = {
    "arid": ARID,
    "warm_humid": WARM_HUMID,
    "cold_humid": COLD_HUMID,
}


def hex_to_rgb(value: str) -> tuple[float, float, float]:
    """'#RRGGBB' → (r, g, b) en 0-1."""
    text = value.lstrip("#")
    if len(text) != 6:
        raise ValueError(f"hex inválido: {value}")
    return tuple(int(text[i : i + 2], 16) / 255 for i in (0, 2, 4))  # type: ignore[return-value]


def rgb_to_hex(red: float, green: float, blue: float) -> str:
    return "#{:02X}{:02X}{:02X}".format(
        round(red * 255), round(green * 255), round(blue * 255)
    )


def ramp(name: str, minimum_m: float, maximum_m: float) -> list[tuple[float, str]]:
    """Rampa continua recortada a [minimum_m, maximum_m].

    Devuelve pares (fracción 0-1, hex) con fracciones estrictamente crecientes;
    los límites de la paleta fuera del rango se recortan a los extremos.
    """
    stops = PALETTES.get(name)
    if stops is None:
        raise ValueError(
            f"hypsometric_palette debe ser una de {sorted(PALETTES)}; recibió {name!r}"
        )
    span = maximum_m - minimum_m
    if not (span > 0):
        # DEM plano: un solo tono (la mitad inferior de la rampa).
        color = stops[0][1]
        return [(0.0, color), (1.0, color)]
    seen: dict[float, str] = {}
    for limit, hex_value in stops:
        fraction = round((min(max(limit, minimum_m), maximum_m) - minimum_m) / span, 9)
        # Al recortar, varias paradas pueden caer en el mismo borde: se queda
        # la primera, que es la vecina del rango real (no un extremo lejano).
        if fraction not in seen:
            seen[fraction] = hex_value
    if 0.0 not in seen:
        seen[0.0] = seen[min(seen)]
    if 1.0 not in seen:
        seen[1.0] = seen[max(seen)]
    return [(fraction, seen[fraction]) for fraction in sorted(seen)]


def resampled_stops(
    name: str, minimum_m: float, maximum_m: float, samples: int = 12
) -> list[dict[str, object]]:
    """Muestreo uniforme de la rampa recortada, para el payload web.

    Con muestras uniformes, el gradiente CSS del visor y el colormap de
    matplotlib representan exactamente la misma función continua.
    """
    pairs = ramp(name, minimum_m, maximum_m)
    span = maximum_m - minimum_m
    result: list[dict[str, object]] = []
    for index in range(samples):
        fraction = index / (samples - 1) if samples > 1 else 0.0
        result.append(
            {
                "limit_m": round(minimum_m + fraction * span, 1),
                "hex": _sample(pairs, fraction),
            }
        )
    return result


def _sample(pairs: list[tuple[float, str]], fraction: float) -> str:
    if fraction <= pairs[0][0]:
        return pairs[0][1]
    if fraction >= pairs[-1][0]:
        return pairs[-1][1]
    for (start, start_hex), (end, end_hex) in zip(pairs, pairs[1:]):
        if start <= fraction <= end:
            if end <= start:
                return end_hex
            mix = (fraction - start) / (end - start)
            a, b = hex_to_rgb(start_hex), hex_to_rgb(end_hex)
            return rgb_to_hex(*(a[i] + (b[i] - a[i]) * mix for i in range(3)))
    return pairs[-1][1]

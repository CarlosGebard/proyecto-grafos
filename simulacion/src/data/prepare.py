"""Preparación de los archivos originales; nunca modifica las fuentes."""

import hashlib
import shutil
import subprocess
from pathlib import Path
from urllib.request import urlopen

SUBDERE_PAGE = "https://proactiva.subdere.gov.cl/handle/123456789/523"
SUBDERE_SHP = "https://proactiva.subdere.gov.cl/bitstream/handle/123456789/523/SHP.rar?isAllowed=y&sequence=5"


def download(url: str, target: Path) -> Path:
    if target.exists():
        return target
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix(target.suffix + ".part")
    try:
        with urlopen(url, timeout=120) as source, temporary.open("wb") as destination:
            shutil.copyfileobj(source, destination)
        temporary.replace(target)
    finally:
        temporary.unlink(missing_ok=True)
    return target


def extract_known(archive: Path, directory: Path, members: list[str]) -> None:
    """Extrae sólo miembros conocidos, sin conservar rutas del archivo RAR."""
    if not archive.is_file():
        raise FileNotFoundError(f"Archivo no encontrado: {archive}")
    executable = shutil.which("7z")
    if executable is None:
        raise RuntimeError("Instalar 7z o proporcionar --population y --dem extraídos")
    directory.mkdir(parents=True, exist_ok=True)
    try:
        subprocess.run(
            [executable, "e", str(archive), f"-o{directory}", "-y", *members],
            check=True,
            capture_output=True,
            text=True,
        )
    except subprocess.CalledProcessError as error:
        raise RuntimeError(
            f"No se pudo extraer {archive}: {error.stderr.strip()}"
        ) from error


def prepare_population(data_dir: Path, allow_download: bool = False) -> Path:
    target = data_dir / "prepared/subdere/SHP/LCA_2021.shp"
    suffixes = ("shp", "shx", "dbf", "prj", "cpg")
    if all(target.with_suffix(f".{ext}").exists() for ext in suffixes):
        return target
    archive = data_dir / "SHP.rar"
    if not archive.exists() and allow_download:
        download(SUBDERE_SHP, archive)
    extract_known(archive, target.parent, [f"SHP/LCA_2021.{ext}" for ext in suffixes])
    return target


def prepare_alos(data_dir: Path) -> Path:
    target = data_dir / "prepared/alos/Biobio/REGION_BIOBIO.jp2"
    if not target.exists():
        extract_known(
            data_dir / "DEM Alos Palsar Región del Biobío.rar",
            target.parent,
            ["Biobio/REGION_BIOBIO.jp2", "Biobio/REGION_BIOBIO.jp2.aux.xml"],
        )
    return target


def fingerprint(path: Path) -> dict:
    """Incluye sidecars SHP y todos los miembros de una GDB."""
    paths = sorted(path.rglob("*")) if path.is_dir() else [path]
    if path.suffix.lower() == ".shp":
        paths = sorted(path.parent.glob(path.stem + ".*"))
    records = []
    for item in paths:
        if item.is_file():
            with item.open("rb") as stream:
                digest = hashlib.file_digest(stream, "sha256").hexdigest()
            records.append(
                {"path": str(item), "sha256": digest, "bytes": item.stat().st_size}
            )
    return {"files": records}

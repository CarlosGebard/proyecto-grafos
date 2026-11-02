#!/bin/sh
# Compilación local con TeX Live, sin instalar formatos en directorios del sistema.
set -eu
cd -- "$(dirname -- "$0")"
mkdir -p build
if [ ! -f build/pdflatex.fmt ]; then
    pdftex -ini -etex -jobname=pdflatex -output-directory=build pdflatex.ini > build/format.log
fi
pdflatex -fmt=build/pdflatex.fmt -interaction=nonstopmode -halt-on-error -output-directory=build informe_pipeline.tex > build/compile-1.log
pdflatex -fmt=build/pdflatex.fmt -interaction=nonstopmode -halt-on-error -output-directory=build informe_pipeline.tex > build/compile-2.log
cp build/informe_pipeline.pdf informe_pipeline.pdf

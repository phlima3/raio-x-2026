"""Recortes finais: de capture/raw (capturas do site) para assets/captures.

Os recortes não retocam nada: só escolhem a região. O que a revisão "sem cara
de IA" tirou do site fica de fora quando dá (o rótulo mono "SITUAÇÃO
ELEITORAL" acima do selo, por exemplo).

Uso: python3 scripts/crops.py
"""

from __future__ import annotations

import shutil
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "capture" / "raw"
OUT = ROOT / "assets" / "captures"


def text_bands(im: Image.Image) -> list[tuple[int, int]]:
    """Faixas horizontais com tinta escura (linhas de texto, bordas)."""
    a = np.asarray(im.convert("RGB")).astype(int)
    dark = (a.sum(axis=2) < 500).any(axis=1)
    bands, start = [], None
    for y, v in enumerate(dark):
        if v and start is None:
            start = y
        if not v and start is not None:
            bands.append((start, y))
            start = None
    if start is not None:
        bands.append((start, len(dark)))
    return bands


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    # Situação eleitoral da ficha, do selo "Registro deferido" até o link de fonte.
    sit = Image.open(RAW / "ficha-hertz-430-situacao.png").convert("RGB")
    bands = [b for b in text_bands(sit) if b[1] - b[0] > 8]
    badge_top = bands[1][0]  # a primeira faixa é o rótulo mono
    sit.crop((0, badge_top - 9, sit.width, sit.height)).save(OUT / "ficha-situacao-fonte.png")

    # A aba Votações como o site mostra hoje, o painel inteiro.
    shutil.copyfile(RAW / "ficha-hertz-430-votacoes-painel.png", OUT / "ficha-votacoes-vazio.png")

    # A busca da home: rótulo, campo e botão.
    shutil.copyfile(RAW / "home-search.png", OUT / "home-busca.png")

    # A primeira proposta de Economia de cada coluna do comparador (regra 2).
    for pair, tag in (("luiz-flavio", "dupla1"), ("renan-augusto", "dupla2")):
        for side in "ab":
            shutil.copyfile(RAW / f"comparar-{pair}-640-{side}-art0.png", OUT / f"{tag}-{side}-proposta.png")

    for f in sorted(OUT.glob("*.png")):
        w, h = Image.open(f).size
        print(f"{f.relative_to(ROOT)}: {w}x{h}")


if __name__ == "__main__":
    main()

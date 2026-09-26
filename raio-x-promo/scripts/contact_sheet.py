"""Contact sheet com a faixa segura desenhada por cima. Só para conferir: nunca vai para o render.

Dois usos:

  python3 scripts/contact_sheet.py video renders/x.mp4 snapshots/folha.jpg
      um quadro por segundo (no meio de cada segundo: 0,5 s, 1,5 s ... 29,5 s),
      lado a lado em 6 colunas, com o tempo no canto.

  python3 scripts/contact_sheet.py pngs snapshots/ snapshots/folha-cenas.jpg
      os PNGs de `hyperframes snapshot` numa pasta, na ordem do nome.

A faixa segura dos Reels/Stories em 1080x1920: 250 px livres no topo, 400 px
embaixo, e a borda direita da metade de baixo (x > 940, y > 960) reservada aos
botões dos Reels. As áreas vetadas saem em vermelho translúcido.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

W, H = 1080, 1920
TOP, BOTTOM = 250, 400
RIGHT_X, RIGHT_Y = 940, 960
COLS = 6
TILE_W, TILE_H = 270, 480
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def overlay(label_expr: str | None) -> str:
    """Filtros ffmpeg: faixas vetadas + linhas-guia + rótulo opcional."""
    veto = "red@0.28"
    line = "red@0.9"
    f = [
        f"drawbox=x=0:y=0:w={W}:h={TOP}:color={veto}:t=fill",
        f"drawbox=x=0:y={H - BOTTOM}:w={W}:h={BOTTOM}:color={veto}:t=fill",
        f"drawbox=x={RIGHT_X}:y={RIGHT_Y}:w={W - RIGHT_X}:h={H - BOTTOM - RIGHT_Y}:color={veto}:t=fill",
        f"drawbox=x=0:y={TOP - 3}:w={W}:h=6:color={line}:t=fill",
        f"drawbox=x=0:y={H - BOTTOM - 3}:w={W}:h=6:color={line}:t=fill",
        f"drawbox=x={RIGHT_X - 3}:y={RIGHT_Y}:w=6:h={H - BOTTOM - RIGHT_Y}:color={line}:t=fill",
    ]
    if label_expr:
        f.append(
            f"drawtext=fontfile={FONT}:text='{label_expr}':x=24:y=24:fontsize=64:"
            "fontcolor=white:box=1:boxcolor=black@0.75:boxborderw=14"
        )
    return ",".join(f)


def run(cmd: list[str]) -> None:
    subprocess.run(cmd, check=True)


def from_video(src: Path, out: Path) -> None:
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
         "stream=nb_frames,r_frame_rate", "-of", "csv=p=0", str(src)],
        capture_output=True, text=True, check=True,
    ).stdout.strip().split(",")
    num, den = (int(x) for x in probe[0].split("/"))
    fps = num / den
    frames = int(probe[1])
    seconds = int(frames / fps)
    rows = -(-seconds // COLS)
    half = int(round(fps / 2))
    step = int(round(fps))
    # rótulo = tempo do quadro (t), com uma casa
    label = "%{eif\\:trunc(t)\\:d}.%{eif\\:mod(round(t*10)\\,10)\\:d} s"
    vf = (
        f"select='gte(n\\,{half})*eq(mod(n-{half}\\,{step})\\,0)',"
        + overlay(label)
        + f",scale={TILE_W}:{TILE_H}:flags=lanczos,tile={COLS}x{rows}:padding=6:margin=6:color=0x1a1614"
    )
    out.parent.mkdir(parents=True, exist_ok=True)
    run(["ffmpeg", "-hide_banner", "-v", "error", "-y", "-i", str(src), "-vf", vf,
         "-fps_mode", "vfr", "-frames:v", "1", "-q:v", "3", str(out)])
    print(f"{out}: {seconds} quadros (um por segundo, no meio do segundo), {COLS}x{rows}")


def from_pngs(folder: Path, out: Path) -> None:
    pngs = sorted(p for p in folder.glob("*.png"))
    if not pngs:
        sys.exit(f"nenhum PNG em {folder}")
    rows = -(-len(pngs) // COLS)
    listfile = out.with_suffix(".txt")
    listfile.write_text("".join(f"file '{p.resolve()}'\nduration 1\n" for p in pngs))
    vf = (
        f"scale={W}:{H}," + overlay(None)
        + f",scale={TILE_W}:{TILE_H}:flags=lanczos,tile={COLS}x{rows}:padding=6:margin=6:color=0x1a1614"
    )
    run(["ffmpeg", "-hide_banner", "-v", "error", "-y", "-f", "concat", "-safe", "0",
         "-i", str(listfile), "-vf", vf, "-frames:v", "1", "-q:v", "3", str(out)])
    listfile.unlink()
    print(f"{out}: {len(pngs)} snapshots, {COLS}x{rows}")


if __name__ == "__main__":
    if len(sys.argv) != 4 or sys.argv[1] not in ("video", "pngs"):
        sys.exit(__doc__)
    mode, src, dst = sys.argv[1], Path(sys.argv[2]), Path(sys.argv[3])
    (from_video if mode == "video" else from_pngs)(src, dst)

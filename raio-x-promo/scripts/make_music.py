"""Trilha do vídeo, sintetizada aqui com numpy. Sem amostra, sem catálogo, sem modelo.

120 BPM: uma batida dura 0,5 s, ou 15 quadros a 30 fps, e 30,0 s são 15 compassos
exatos. Os acordes trocam nos cortes do vídeo (todos caem em batida), e as duas
duplas do comparador recebem a mesma música, compasso por compasso.

Tom de serviço público: pad morno em Fá maior, um pulso de colcheias abafado
(o "tique" do raio-x), baixo e bumbo em meio-tempo. Nada de fanfarra.

Uso: python3 scripts/make_music.py  ->  assets/audio/trilha.wav (48 kHz, 16 bits, estéreo)
"""

from __future__ import annotations

import wave
from pathlib import Path

import numpy as np

SR = 48_000
BPM = 120
BEAT = 60 / BPM  # 0,5 s
DURATION = 30.0
N = int(round(DURATION * SR))
OUT = Path(__file__).resolve().parent.parent / "assets" / "audio" / "trilha.wav"

# Cortes do vídeo (s). Iguais aos `data-start` de index.html.
CUTS = {
    "gancho": 0.0,
    "painel": 3.0,
    "dupla1": 5.0,
    "dupla2": 12.5,
    "votacoes": 20.0,
    "fontes": 22.5,
    "fecho": 26.0,
}

# Notas em MIDI.
F2, G2, A2, Bb2, C3, D3 = 41, 43, 45, 46, 48, 50
CHORDS = {
    "Fmaj9": [53, 57, 60, 64, 67],
    "Dm9": [50, 53, 57, 60, 64],
    "Bbmaj7": [46, 50, 53, 57, 62],
    "Gm9": [43, 50, 53, 57, 58],
    "Csus4": [48, 53, 55, 60, 65],
    "C": [48, 52, 55, 60, 64],
    "Fadd9": [53, 57, 60, 65, 67],
}


def dupla(t0: float) -> list[tuple[float, float, str, int]]:
    """A mesma sequência para as duas duplas: (início, fim, acorde, baixo)."""
    return [
        (t0 + 0.0, t0 + 3.0, "Bbmaj7", Bb2),
        (t0 + 3.0, t0 + 5.0, "Gm9", G2),
        (t0 + 5.0, t0 + 6.5, "Csus4", C3),
        (t0 + 6.5, t0 + 7.5, "C", C3),
    ]


SECTIONS: list[tuple[float, float, str, int | None]] = [
    (0.0, 3.0, "Fmaj9", None),
    (3.0, 5.0, "Dm9", D3),
    *dupla(CUTS["dupla1"]),
    *dupla(CUTS["dupla2"]),
    (20.0, 22.5, "Dm9", D3),
    (22.5, 24.0, "Bbmaj7", Bb2),
    (24.0, 25.0, "Csus4", C3),
    (25.0, 26.0, "C", C3),
    (26.0, 30.0, "Fadd9", F2),
]

rng = np.random.default_rng(2026)
t_all = np.arange(N) / SR


def hz(midi: float) -> float:
    return 440.0 * 2 ** ((midi - 69) / 12)


def at(t: float) -> int:
    return int(round(t * SR))


def lowpass(x: np.ndarray, cutoff: float, order: int = 2) -> np.ndarray:
    """Passa-baixa suave por FFT (offline, sem scipy)."""
    spec = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    spec /= np.sqrt(1 + (f / cutoff) ** (2 * order))
    return np.fft.irfft(spec, len(x))


def highpass(x: np.ndarray, cutoff: float, order: int = 2) -> np.ndarray:
    spec = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    spec *= 1 - 1 / np.sqrt(1 + (f / cutoff) ** (2 * order))
    return np.fft.irfft(spec, len(x))


def env_adsr(n: int, a: float, r: float) -> np.ndarray:
    e = np.ones(n)
    na, nr = max(1, int(a * SR)), max(1, int(r * SR))
    e[:na] = np.linspace(0, 1, na) ** 2
    e[-nr:] *= np.linspace(1, 0, nr) ** 1.5
    return e


def add(buf: np.ndarray, sig: np.ndarray, start: float, pan: float = 0.0, gain: float = 1.0) -> None:
    i = at(start)
    if i >= N:
        return
    if i < 0:  # começa antes do 0: corta a cabeça
        sig, i = sig[-i:], 0
    sig = sig[: N - i] * gain
    left = np.cos((pan + 1) * np.pi / 4)
    right = np.sin((pan + 1) * np.pi / 4)
    buf[0, i : i + len(sig)] += sig * left
    buf[1, i : i + len(sig)] += sig * right


def pad_voice(freq: float, dur: float) -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for detune in (-0.07, 0.0, 0.06):
        f = freq * 2 ** (detune / 12)
        phase = rng.uniform(0, 2 * np.pi)
        # triângulo com poucas harmônicas: morno, sem brilho de sintetizador
        out += (
            np.sin(2 * np.pi * f * t + phase)
            - np.sin(2 * np.pi * 3 * f * t + phase) / 9
            + np.sin(2 * np.pi * 5 * f * t + phase) / 25
        )
    return out / 3


def pluck(freq: float, vel: float) -> np.ndarray:
    dur = 0.55
    n = int(dur * SR)
    t = np.arange(n) / SR
    body = (
        np.sin(2 * np.pi * freq * t)
        + 0.28 * np.sin(2 * np.pi * 2 * freq * t) * np.exp(-t / 0.05)
        + 0.10 * np.sin(2 * np.pi * 3.01 * freq * t) * np.exp(-t / 0.03)
    )
    e = np.exp(-t / 0.16) * (1 - np.exp(-t / 0.003))
    return body * e * vel


def kick(vel: float) -> np.ndarray:
    dur = 0.45
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = 46 + 70 * np.exp(-t / 0.035)
    phase = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(phase) * np.exp(-t / 0.16) * (1 - np.exp(-t / 0.002)) * vel


def tick(vel: float) -> np.ndarray:
    n = int(0.05 * SR)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    noise = np.diff(np.concatenate([[0.0], noise]))  # tira o grave
    return noise * np.exp(-t / 0.008) * vel


def bass_note(freq: float, dur: float, vel: float) -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = np.sin(2 * np.pi * freq * t) + 0.18 * np.sin(2 * np.pi * 2 * freq * t)
    return s * np.exp(-t / 0.55) * (1 - np.exp(-t / 0.006)) * env_adsr(n, 0.004, 0.08) * vel


mix_pad = np.zeros((2, N))
mix_pulse = np.zeros((2, N))
mix_low = np.zeros((2, N))
mix_tick = np.zeros((2, N))

# Pad: cada acorde sobrepõe o próximo 0,25 s para a troca não soar como corte seco.
for start, end, name, _ in SECTIONS:
    dur = end - start + 0.6
    for k, note in enumerate(CHORDS[name]):
        v = pad_voice(hz(note), dur) * env_adsr(int(dur * SR), 0.35, 0.6)
        add(mix_pad, v, start - 0.05, pan=(-0.45 + 0.9 * k / 4), gain=0.11)

# Pulso de colcheias: arpejo abafado com as notas do acorde da vez.
# No gancho é uma nota só, uma por palavra que acende (0,25 s cada).
eighths = np.arange(0, DURATION, BEAT / 2)
for i, t0 in enumerate(eighths):
    if t0 >= 28.0:
        break
    sec = next(s for s in SECTIONS if s[0] <= t0 < s[1])
    notes = CHORDS[sec[2]]
    if t0 < CUTS["painel"]:
        note = 72  # Dó: o tique do raio-x
    else:
        pattern = [2, 3, 4, 3, 2, 4, 3, 1]
        note = notes[pattern[i % 8]] + 12
    on_beat = (i % 2) == 0
    vel = 0.9 if on_beat else 0.55
    if t0 >= 26.5:  # o fecho vai esvaziando
        vel *= max(0.0, 1 - (t0 - 26.5) / 1.7)
    add(mix_pulse, pluck(hz(note), vel), t0, pan=(0.18 if i % 2 else -0.18), gain=0.16)

# Baixo e bumbo em meio-tempo (uma vez por segundo), a partir do painel.
for start, end, name, root in SECTIONS:
    if root is None:
        continue
    t0 = start
    while t0 < min(end, 27.5) - 1e-6:
        length = min(1.0, end - t0) + 0.3
        add(mix_low, bass_note(hz(root), length, 0.85 if t0 == start else 0.6), t0, gain=0.34)
        t0 += 1.0

kick_times = set()
for start, *_ in SECTIONS:
    if CUTS["painel"] <= start < CUTS["fecho"]:
        kick_times.add(round(start, 3))  # todo corte tem bumbo
t0 = CUTS["painel"]
while t0 < CUTS["fecho"]:
    kick_times.add(round(t0, 3))
    t0 += 1.0
kick_times.add(CUTS["fecho"])
for kt in sorted(kick_times):
    vel = 1.0 if kt in CUTS.values() else 0.7
    if CUTS["votacoes"] <= kt < CUTS["fontes"] and kt not in CUTS.values():
        vel = 0.45  # votações: respira
    add(mix_low, kick(vel), kt, gain=0.5)

# Tique alto, bem baixo, nos contratempos das duplas e das fontes.
for t0 in eighths:
    if CUTS["dupla1"] <= t0 < CUTS["votacoes"] or CUTS["fontes"] <= t0 < CUTS["fecho"]:
        if round(t0 / (BEAT / 2)) % 2 == 1:
            add(mix_tick, tick(1.0), t0, pan=0.25, gain=0.05)

# Tratamento por barramento.
for ch in range(2):
    mix_pad[ch] = lowpass(mix_pad[ch], 1400)
    mix_pulse[ch] = lowpass(mix_pulse[ch], 3200)
    mix_low[ch] = lowpass(mix_low[ch], 900)
    mix_tick[ch] = highpass(mix_tick[ch], 5000)

mix = mix_pad + mix_pulse + mix_low + mix_tick

# Um eco curto e discreto no pulso (colcheia pontuada), só para dar ar.
delay = int(0.375 * SR)
echo = np.zeros_like(mix_pulse)
echo[:, delay:] = mix_pulse[:, :-delay] * 0.22
echo = echo[::-1]  # inverte os canais: o eco volta do outro lado
mix += lowpass(echo[0], 2200)[None, :] * np.array([[0.0], [1.0]]) + lowpass(echo[1], 2200)[None, :] * np.array([[1.0], [0.0]])

# Entrada e saída: 30 ms de fade-in; o fecho morre nos 1,4 s finais.
fade_in = int(0.03 * SR)
mix[:, :fade_in] *= np.linspace(0, 1, fade_in)
fade_out = int(1.4 * SR)
mix[:, -fade_out:] *= np.linspace(1, 0, fade_out) ** 2

# Nível: pico em -1 dBFS depois de uma saturação suave.
mix = np.tanh(mix * 1.1) / np.tanh(1.1)
mix *= 10 ** (-1 / 20) / np.max(np.abs(mix))

OUT.parent.mkdir(parents=True, exist_ok=True)
pcm = (np.clip(mix.T, -1, 1) * 32767).astype("<i2")
with wave.open(str(OUT), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())

rms = 20 * np.log10(np.sqrt(np.mean(mix**2)) + 1e-12)
print(f"{OUT.relative_to(OUT.parent.parent.parent)}: {len(pcm) / SR:.3f} s, {SR} Hz, RMS {rms:.1f} dBFS, {BPM} BPM")

#!/usr/bin/env python3
"""Synthesize a beat track whose hits land exactly on frame boundaries (royalty-free, made from scratch).

    beat.py OUT.wav --bpm 120 --beats 20 [--fps 30]

Kick on every beat (150->45 Hz decaying sine sweep), hat on the off-beat, light snare on beats 2 and 4.
At 120 BPM and 30 fps one beat is exactly 15 frames, so a page can compute the current beat as
floor(frame / 15) and every visual cut lines up with a kick.
"""
import argparse

import numpy as np
import scipy.io.wavfile as wavfile

SR = 48000

ap = argparse.ArgumentParser()
ap.add_argument("out")
ap.add_argument("--bpm", type=float, default=120)
ap.add_argument("--beats", type=int, default=20)
ap.add_argument("--fps", type=int, default=30)
ap.add_argument("--tail", type=float, default=0.6, help="seconds of decay after the last beat")
a = ap.parse_args()

spb = 60.0 / a.bpm
if abs(spb * a.fps - round(spb * a.fps)) > 1e-6:
    print(f"warning: one beat = {spb * a.fps:.3f} frames; pick a BPM where this is an integer (e.g. 120 @ 30fps)")
n = int(SR * (a.beats * spb + a.tail))
mix = np.zeros(n)
rng = np.random.default_rng(7)


def put(sig, at):
    i = int(round(at * SR))
    j = min(n, i + len(sig))
    if i < n:
        mix[i:j] += sig[: j - i]


def kick(dur=0.35):
    t = np.arange(int(SR * dur)) / SR
    f = 45 + 105 * np.exp(-t / 0.045)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.12) * 0.9


def noise(dur, decay, vol, hp=True):
    k = int(SR * dur)
    x = rng.standard_normal(k)
    if hp:
        x = np.diff(x, prepend=0.0)
    return x / (np.abs(x).max() + 1e-9) * vol * np.exp(-np.arange(k) / (SR * decay))


for b in range(a.beats):
    t = b * spb
    put(kick(), t)
    put(noise(0.05, 0.012, 0.18), t + spb / 2)
    if b % 4 in (1, 3):
        put(noise(0.18, 0.05, 0.28, hp=False), t)

mix /= np.abs(mix).max() / 0.89
stereo = np.stack([mix, mix], 1)
wavfile.write(a.out, SR, (stereo * 32767).astype(np.int16))
print("wrote", a.out, f"{a.beats} beats @ {a.bpm} BPM = {a.beats * spb:.2f}s")

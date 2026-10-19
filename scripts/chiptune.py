#!/usr/bin/env python3
"""Code-synthesized 8-bit chiptune (royalty-free, made from scratch): chiptune.py OUT.wav [seconds]

Square-wave lead (25% duty), triangle bass, noise-channel drums, 150 BPM, I-V-vi-IV in C.
"""
import sys
import numpy as np
import scipy.io.wavfile as wavfile

SR = 44100
BPM = 150
SPB = 60 / BPM
out = sys.argv[1]
secs = float(sys.argv[2]) if len(sys.argv) > 2 else 15.0
n = int(SR * secs)


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def square(freq, dur, duty=0.25, vol=0.18):
    t = np.arange(int(SR * dur)) / SR
    w = np.where((t * freq) % 1.0 < duty, 1.0, -1.0) * vol
    env = np.minimum(1, np.linspace(1.6, 0, len(t)) + 0.35)
    return w * env


def triangle(freq, dur, vol=0.32):
    t = np.arange(int(SR * dur)) / SR
    ph = (t * freq) % 1.0
    return (4 * np.abs(ph - 0.5) - 1) * vol


def noise(dur, vol, decay):
    k = int(SR * dur)
    rng = np.random.default_rng(7)
    return rng.choice([-1.0, 1.0], k) * vol * np.exp(-np.arange(k) / (SR * decay))


mix = np.zeros(n + SR)


def put(sig, at):
    i = int(at * SR)
    j = min(len(mix), i + len(sig))
    mix[i:j] += sig[: j - i]


chords = [(48, [60, 64, 67]), (43, [59, 62, 67]), (45, [60, 64, 69]), (41, [60, 65, 69])]
melody = [
    [72, 76, 79, 76, 77, 76, 74, 72], [71, 74, 79, 74, 76, 74, 72, 71],
    [72, 76, 81, 79, 77, 76, 74, 76], [77, 76, 74, 72, 74, 76, 77, 79],
]
bar = 4 * SPB
t = 0.0
b = 0
while t < secs:
    root, triad = chords[b % 4]
    for k in range(8):                                   # bass: root/octave eighths
        put(triangle(midi(root + (12 if k % 2 else 0)), SPB / 2 * 0.9), t + k * SPB / 2)
    for k in range(16):                                  # arpeggio sixteenths, quiet 12.5% duty
        put(square(midi(triad[k % 3] + 12), SPB / 4 * 0.8, duty=0.125, vol=0.06), t + k * SPB / 4)
    if b >= 1:                                           # lead enters after one bar
        for k, m in enumerate(melody[b % 4]):
            put(square(midi(m), SPB / 2 * 0.85), t + k * SPB / 2)
    for k in range(4):                                   # drums: kick-ish on 1/3, snare on 2/4, hats on eighths
        if k % 2:
            put(noise(0.09, 0.30, 0.03), t + k * SPB)
        else:
            put(triangle(55, 0.08, 0.5) * np.exp(-np.arange(int(SR * 0.08)) / (SR * 0.02)), t + k * SPB)
        put(noise(0.03, 0.07, 0.008), t + k * SPB + SPB / 2)
    t += bar
    b += 1

mix = mix[:n]
mix /= np.abs(mix).max() / 0.89
stereo = np.stack([mix, np.roll(mix, int(SR * 0.012)) * 0.96], 1)
wavfile.write(out, SR, (stereo * 32767).astype(np.int16))
print("wrote", out, secs, "s")

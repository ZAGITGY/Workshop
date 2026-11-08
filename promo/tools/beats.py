"""หา onset / บีตของเพลงช่วงที่ใช้ในคลิป (17.6–32.6 วิ) แล้วพิมพ์เวลาเทียบกับเวลาในคลิป
ใช้:  python beats.py music/no-radar-slowed.mp3
"""
import sys, json
import numpy as np
import librosa

path = sys.argv[1]
START, END = 17.6, 32.6
y, sr = librosa.load(path, sr=22050, mono=True, offset=START - 2, duration=(END - START) + 4)
off = START - 2
hop = 256
env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
tempo, beats = librosa.beat.beat_track(onset_envelope=env, sr=sr, hop_length=hop, units='time')
onsets = librosa.onset.onset_detect(onset_envelope=env, sr=sr, hop_length=hop, units='time', backtrack=False)
# พลังงานย่านต่ำ (kick) แยก
S = np.abs(librosa.stft(y, n_fft=2048, hop_length=hop))
freqs = librosa.fft_frequencies(sr=sr, n_fft=2048)
low = S[freqs < 150].sum(axis=0)
low = low / (low.max() + 1e-9)
lowd = np.maximum(0, np.diff(low, prepend=low[0]))
times = librosa.frames_to_time(np.arange(len(low)), sr=sr, hop_length=hop)
kick_idx = librosa.util.peak_pick(lowd, pre_max=6, post_max=6, pre_avg=10, post_avg=10, delta=0.05, wait=8)
rms = librosa.feature.rms(y=y, hop_length=hop)[0]

def clip(t):
    return round(t + off - START, 3)

print('tempo', np.atleast_1d(tempo)[0])
print('beats (clip time):', [clip(t) for t in beats if 0 <= clip(t) <= 15])
print('onsets (clip time):', [clip(t) for t in onsets if 0 <= clip(t) <= 15])
print('kicks (clip time):', [(clip(times[i]), round(float(lowd[i]), 2)) for i in kick_idx if 0 <= clip(times[i]) <= 15])
# rms per 0.25s
seg = []
for k in range(0, 60):
    a, b = START + k * 0.25, START + (k + 1) * 0.25
    m = (times + off >= a) & (times + off < b)
    seg.append(round(float(rms[m].mean()), 3) if m.any() else 0)
print('rms/0.25s:', seg)

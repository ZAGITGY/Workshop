"""ตรวจคลิปก่อนส่ง
  - ดึงภาพนิ่งทุก 1 วิ -> qa/clip-XXs.jpg + qa/clip-contact.jpg
  - หาเฟรมดำ (ffmpeg blackdetect) และเฟรมซ้ำ/กระตุก (ความต่างระหว่างเฟรมติดกัน)
  - วางภาพเสื้อตอนกล้องใกล้ เทียบกับ reference/05-t8.6s.jpg -> qa/compare-ref05.jpg
ใช้:  python -I tools/qa.py out/promo.mp4
"""
import subprocess, sys, os, json
import numpy as np
from PIL import Image

clip = sys.argv[1]
here = os.path.dirname(os.path.abspath(__file__))
promo = os.path.dirname(here)
qa = os.path.join(promo, 'qa')
os.makedirs(qa, exist_ok=True)

def frames_at(times, size=None):
    out = []
    for t in times:
        args = ['ffmpeg', '-v', 'error', '-ss', f'{t:.3f}', '-i', clip, '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', '-']
        png = subprocess.run(args, capture_output=True, check=True).stdout
        from io import BytesIO
        out.append(Image.open(BytesIO(png)).convert('RGB'))
    return out

# 1) ภาพนิ่งทุก 1 วิ
times = [i + 0.5 for i in range(15)]
ims = frames_at(times)
for t, im in zip(times, ims):
    im.save(os.path.join(qa, f'clip-{int(t):02d}s.jpg'), quality=88)
w, h = 270, 480
sheet = Image.new('RGB', (w * 5, h * 3), 'black')
for i, im in enumerate(ims):
    sheet.paste(im.resize((w, h)), ((i % 5) * w, (i // 5) * h))
sheet.save(os.path.join(qa, 'clip-contact.jpg'), quality=88)

# 2) เฟรมดำ
bd = subprocess.run(['ffmpeg', '-v', 'info', '-i', clip, '-vf', 'blackdetect=d=0.03:pix_th=0.06', '-an', '-f', 'null', '-'], capture_output=True, text=True).stderr
black = [l for l in bd.splitlines() if 'black_start' in l]

# 3) ความต่างระหว่างเฟรมติดกัน (หาเฟรมซ้ำ = กระตุก, หรือกระโดดแรงผิดปกติ)
raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', clip, '-vf', 'scale=135:240,format=gray', '-f', 'rawvideo', '-'], capture_output=True, check=True).stdout
arr = np.frombuffer(raw, np.uint8).reshape(-1, 240, 135).astype(np.float32)
diff = np.abs(np.diff(arr, axis=0)).mean(axis=(1, 2))
dups = [int(i + 1) for i, d in enumerate(diff) if d < 0.02]
spikes = sorted(((float(d), int(i + 1)) for i, d in enumerate(diff)), reverse=True)[:8]

report = {
    'frames': int(arr.shape[0]),
    'black_segments': black,
    'duplicate_frames': dups,
    'biggest_jumps (diff, frame, sec)': [(round(d, 2), f, round(f / 30, 2)) for d, f in spikes],
    'median_diff': round(float(np.median(diff)), 3),
}
print(json.dumps(report, indent=1, ensure_ascii=False))
with open(os.path.join(qa, 'clip-report.json'), 'w') as f:
    json.dump(report, f, indent=1, ensure_ascii=False)

# 4) เทียบกับ reference 05 (เสื้อตอนกล้องใกล้ = ช็อตซูมเข้าคอเสื้อในฉาก DROP 01)
ref_path = os.path.join(promo, 'reference', '05-t8.6s.jpg')
if os.path.exists(ref_path):
    ref = Image.open(ref_path).convert('RGB')
    ours = frames_at([8.4])[0]  # ช็อตซูมเข้าคอเสื้อ
    H = 960
    a = ref.resize((int(ref.width * H / ref.height), H))
    b = ours.resize((int(ours.width * H / ours.height), H))
    cmp_ = Image.new('RGB', (a.width + b.width + 20, H), 'white')
    cmp_.paste(a, (0, 0)); cmp_.paste(b, (a.width + 20, 0))
    cmp_.save(os.path.join(qa, 'compare-ref05.jpg'), quality=88)

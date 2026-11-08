"""MOK STUDIO — ปั้นเสื้อยืด 3D จากแพทเทิร์นจริง ด้วย cloth simulation ของ Blender

ขั้นตอน (รันทีละ stage หรือรวดเดียวก็ได้)
  sim    ตัดแพทเทิร์น 4 ชิ้น (ตัวหน้า ตัวหลัง แขน 2 ข้าง) วางรอบหุ่น แล้วเย็บด้วย sewing springs
         ให้ผ้าค้างบนหุ่นจนเกิดรอยยับตามธรรมชาติ  -> cache/sewn.blend
  drape  เอาเสื้อที่เย็บแล้วมาวางนอนแล้วปล่อยลงบนแท่นทรงกระบอก        -> cache/draped.blend
  export ทำ Subdivision, ร่องตะเข็บ, พับขอบชาย/ปลายแขน, คอยางยืดแยกชิ้น, Solidify 2 มม.
         แล้ว export  ../models/tshirt.glb  และ  ../models/tshirt-draped.glb (Draco)
  qa     render 4 มุม (หน้า ข้าง หลัง 3/4) ภายใต้ไฟสตูดิโอ  -> ../qa/model-*.png

วิธีรัน:
  blender -b --factory-startup --python tshirt.py -- sim drape export qa
หน่วยเป็นเมตร แกน Z ขึ้น ด้านหน้าเสื้อหันไปทาง -Y (Blender) -> ตอน export glTF จะเป็น Y ขึ้น หน้าเสื้อหัน +Z
"""
import bpy
import bmesh
import math
import os
import sys
import json
import numpy as np
from mathutils import Vector, Matrix
from mathutils.kdtree import KDTree

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ['sim', 'drape', 'export', 'qa']
HERE = os.path.dirname(os.path.abspath(__file__))
PROMO = os.path.dirname(HERE)
CACHE = os.path.join(HERE, 'cache')
MODELS = os.path.join(PROMO, 'models')
QA = os.path.join(PROMO, 'qa')
for d in (CACHE, MODELS, QA):
    os.makedirs(d, exist_ok=True)

# ---------------------------------------------------------------------------
# แพทเทิร์น (หน่วยเมตร, ไซซ์ M ทรงหลวมนิดๆ)
# ---------------------------------------------------------------------------
W = 0.272            # ครึ่งความกว้างตัวเสื้อ (รอบอก ~109 ซม. ทรงหลวม)
W_HEM = 0.29         # ชายเสื้อบานออกนิดๆ ให้ผ้าทิ้งตัวเป็นลอน
HS = 0.47            # ตะเข็บข้าง: ชายเสื้อ -> ใต้รักแร้
SP = (0.23, 0.665)   # ปลายไหล่
HPS = (0.085, 0.71)  # จุดไหล่ชิดคอ (ความยาวเสื้อ 71 ซม.)
M_SIDE, K_ARM, S_SH = 29, 14, 9   # จำนวนจุดบนตะเข็บข้าง / วงแขน / ตะเข็บไหล่ (ต้องตรงกันทั้งสองฝั่งที่เย็บ)
SW, CW, UAH, CAP = 0.200, 0.19, 0.12, 0.22   # แขน: ครึ่งกว้างรักแร้ / ครึ่งกว้างปลายแขน / ตะเข็บใต้แขน / สูงหัวแขน
NV_SLEEVE = 8
Z_HEM = 0.80
UV_SCALE = 1.0 / 1.15   # 1 หน่วย UV = 1.15 ม. ของผ้า (ใช้ตั้ง repeat ของ normal map ลายผ้า)

THICK = 0.002        # ความหนาผ้า 2 มม.


def bezier(p0, p1, p2, p3, n=400):
    t = np.linspace(0, 1, n)[:, None]
    P = [np.array(p, float) for p in (p0, p1, p2, p3)]
    return ((1 - t) ** 3) * P[0] + 3 * ((1 - t) ** 2) * t * P[1] + 3 * (1 - t) * t * t * P[2] + t ** 3 * P[3]


def line(a, b, n=50):
    t = np.linspace(0, 1, n)[:, None]
    return (1 - t) * np.array(a, float) + t * np.array(b, float)


def plen(p):
    return float(np.linalg.norm(np.diff(p, axis=0), axis=1).sum())


def resample(poly, count):
    seg = np.linalg.norm(np.diff(poly, axis=0), axis=1)
    s = np.concatenate([[0], np.cumsum(seg)])
    target = np.linspace(0, s[-1], count)
    return np.stack([np.interp(target, s, poly[:, k]) for k in range(poly.shape[1])], 1)


def chain(*parts):
    out = [parts[0]]
    for p in parts[1:]:
        out.append(p[1:])
    return np.concatenate(out)


def coons(B, T, L, R, smooth_iters=40):
    nu, nv = len(B), len(L)
    assert len(T) == nu and len(R) == nv, (len(B), len(T), len(L), len(R))
    P = np.zeros((nv, nu, 2))
    for j in range(nv):
        t = j / (nv - 1)
        for i in range(nu):
            s = i / (nu - 1)
            P[j, i] = ((1 - t) * B[i] + t * T[i] + (1 - s) * L[j] + s * R[j]
                       - ((1 - s) * (1 - t) * B[0] + s * (1 - t) * B[-1] + (1 - s) * t * T[0] + s * t * T[-1]))
    P[0, :] = B
    P[-1, :] = T
    P[:, 0] = L
    P[:, -1] = R
    for _ in range(smooth_iters):
        P[1:-1, 1:-1] = 0.5 * P[1:-1, 1:-1] + 0.125 * (P[:-2, 1:-1] + P[2:, 1:-1] + P[1:-1, :-2] + P[1:-1, 2:])
    return P


def armhole(back):
    if back:
        return bezier((W, HS), (0.22, 0.475), (0.215, 0.61), SP)
    return bezier((W, HS), (0.21, 0.47), (0.205, 0.60), SP)


def body_piece(back):
    if back:
        neck = bezier(HPS, (0.08, 0.695), (0.04, 0.69), (0, 0.69))
        nh = 7
    else:
        neck = bezier(HPS, (0.085, 0.65), (0.045, 0.62), (0, 0.62))
        nh = 9
    side = resample(line((W_HEM, 0), (W, HS)), M_SIDE)
    arm = resample(armhole(back), K_ARM)
    Rb = chain(side, arm)
    Lb = Rb * np.array([-1, 1])
    shR = resample(line(SP, HPS), S_SH)          # ปลายไหล่ขวา -> คอ
    neckR = resample(neck, nh)                    # คอขวา -> กลางคอ
    shL = shR * np.array([-1, 1])
    neckL = neckR * np.array([-1, 1])
    T = chain(shL, neckL, neckR[::-1], shR[::-1])
    nu = len(T)
    B = resample(line((-W_HEM, 0), (W_HEM, 0)), nu)
    P = coons(B, T, Lb, Rb)
    neck_poly = chain(neckL, neckR[::-1])
    info = dict(nu=nu, nv=len(Rb), nh=nh, neck=neck_poly)
    return P, info


def sleeve_piece():
    capF = resample(bezier((-SW, UAH), (-0.125, UAH + 0.006), (-0.07, CAP), (0, CAP)), K_ARM)
    capB = capF * np.array([-1, 1])
    T = chain(capF, capB[::-1])
    nu = len(T)
    L = resample(line((-CW, 0), (-SW, UAH)), NV_SLEEVE)
    R = resample(line((CW, 0), (SW, UAH)), NV_SLEEVE)
    B = resample(line((-CW, 0), (CW, 0)), nu)
    return coons(B, T, L, R), dict(nu=nu, nv=NV_SLEEVE, cap_half=plen(bezier((-SW, UAH), (-0.125, UAH + 0.006), (-0.07, CAP), (0, CAP))))


# ---------------------------------------------------------------------------
# วางชิ้นผ้ารอบหุ่น (arrangement)
# ---------------------------------------------------------------------------
def ellipse_arc_map(A, B):
    th = np.linspace(-math.pi, math.pi, 8001)
    pts = np.stack([A * np.sin(th), -B * np.cos(th)], 1)
    seg = np.linalg.norm(np.diff(pts, axis=0), axis=1)
    s = np.concatenate([[0], np.cumsum(seg)])
    s -= np.interp(0, th, s)

    def f(u):
        t = np.interp(u, s, th)
        return A * np.sin(t), -B * np.cos(t)
    return f


ARC = ellipse_arc_map(0.21, 0.16)
ARM_ANGLE = math.radians(45)          # แขนกางลง 45 องศา
JOINT_X, JOINT_Z = 0.175, 1.38


def body_to_3d(u, v, back):
    x, y = ARC(u)
    if back:
        y = -y
    k = 1.0
    if v > 0.56:
        k = 1.0 - 0.55 * min(1.0, (v - 0.56) / 0.15) ** 1.5
    return Vector((x, y * k, Z_HEM + v))


def arm_frame(side):
    d = Vector((side * math.cos(ARM_ANGLE), 0, -math.sin(ARM_ANGLE)))
    up = Vector((side * math.sin(ARM_ANGLE), 0, math.cos(ARM_ANGLE)))
    J = Vector((side * JOINT_X, 0, JOINT_Z))
    return J, d, up


def sleeve_to_3d(u, v, side):
    J, d, up = arm_frame(side)
    R = 0.075
    phi = u / R
    t = (CAP - v) - 0.03
    return J + t * d + R * (math.cos(phi) * up + math.sin(phi) * Vector((0, 1, 0)))


# ---------------------------------------------------------------------------
# หุ่น (collider) — ลำตัว คอ แขน
# ---------------------------------------------------------------------------
def make_mannequin():
    bm = bmesh.new()
    prof = [(0.50, 0.160, 0.110), (0.62, 0.158, 0.108), (0.78, 0.152, 0.104), (0.92, 0.148, 0.102),
            (1.05, 0.158, 0.110), (1.17, 0.168, 0.118), (1.27, 0.172, 0.118), (1.35, 0.176, 0.112),
            (1.41, 0.175, 0.100), (1.45, 0.160, 0.088), (1.48, 0.130, 0.075), (1.50, 0.090, 0.065),
            (1.51, 0.060, 0.058)]
    N = 48
    rings = []
    for z, a, b in prof:
        ring = [bm.verts.new((a * math.sin(2 * math.pi * k / N), -b * math.cos(2 * math.pi * k / N), z)) for k in range(N)]
        rings.append(ring)
    for r0, r1 in zip(rings[:-1], rings[1:]):
        for k in range(N):
            bm.faces.new((r0[k], r0[(k + 1) % N], r1[(k + 1) % N], r1[k]))
    top = bm.verts.new((0, 0, 1.515))
    for k in range(N):
        bm.faces.new((rings[-1][k], rings[-1][(k + 1) % N], top))
    # คอ
    bmesh.ops.create_cone(bm, cap_ends=True, segments=32, radius1=0.056, radius2=0.052, depth=0.16,
                          matrix=Matrix.Translation((0, 0.005, 1.55)))
    # แขน: ทรงกระบอกเรียว + ทรงกลมที่หัวไหล่
    for side in (1, -1):
        J, d, up = arm_frame(side)
        rot = d.to_track_quat('Z', 'Y').to_matrix().to_4x4()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=32, radius1=0.050, radius2=0.040, depth=0.34,
                              matrix=Matrix.Translation(J + d * 0.17) @ rot)
        bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=16, radius=0.060, matrix=Matrix.Translation(J))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new('Mannequin')
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new('Mannequin', me)
    bpy.context.scene.collection.objects.link(ob)
    mod = ob.modifiers.new('Collision', 'COLLISION')
    ob.collision.thickness_outer = 0.006
    ob.collision.thickness_inner = 0.02
    ob.collision.cloth_friction = 8.0
    ob.collision.damping = 0.6
    return ob


# ---------------------------------------------------------------------------
# สร้าง mesh ผ้าทั้ง 4 ชิ้น + เส้นเย็บ
# ---------------------------------------------------------------------------
def build_garment():
    front, fi = body_piece(False)
    back, bi = body_piece(True)
    sleeve, si = sleeve_piece()
    arm_len = plen(armhole(False)), plen(armhole(True))
    print(f'[pattern] armhole front {arm_len[0]*100:.1f} cm back {arm_len[1]*100:.1f} cm | sleeve cap half {si["cap_half"]*100:.1f} cm')

    bm = bmesh.new()
    uv_layer = bm.loops.layers.uv.new('UVMap')
    deform = bm.verts.layers.deform.verify()
    pieces = {}
    groups = ['seam', 'hem', 'cuff', 'neck', 'body', 'sleeve']
    G = {g: i for i, g in enumerate(groups)}

    uv_offsets = {'front': (0.02, 0.02), 'back': (0.60, 0.02), 'sleeve_r': (0.02, 0.70), 'sleeve_l': (0.50, 0.70)}

    def add_piece(name, P, to3d, flip, kind, neck_poly=None):
        nv, nu = P.shape[:2]
        verts = []
        minx = P[..., 0].min()
        miny = P[..., 1].min()
        for j in range(nv):
            row = []
            for i in range(nu):
                u, v = float(P[j, i][0]), float(P[j, i][1])
                vert = bm.verts.new(to3d(u, v))
                dv = vert[deform]
                if kind == 'body':
                    dv[G['body']] = 1.0
                    dv[G['hem']] = max(0.0, 1.0 - v / 0.05)
                    if neck_poly is not None:
                        dn = float(np.min(np.linalg.norm(neck_poly - np.array([u, v]), axis=1)))
                        dv[G['neck']] = max(0.0, 1.0 - dn / 0.05)
                else:
                    dv[G['sleeve']] = 1.0
                    dv[G['cuff']] = max(0.0, 1.0 - v / 0.05)
                row.append(vert)
            verts.append(row)
        ox, oy = uv_offsets[name]
        for j in range(nv - 1):
            for i in range(nu - 1):
                q = [verts[j][i], verts[j][i + 1], verts[j + 1][i + 1], verts[j + 1][i]]
                uvs = [P[j, i], P[j, i + 1], P[j + 1, i + 1], P[j + 1, i]]
                if flip:
                    q = q[::-1]
                    uvs = uvs[::-1]
                f = bm.faces.new(q)
                for loop, (pu, pv) in zip(f.loops, uvs):
                    loop[uv_layer].uv = (ox + (pu - minx) * UV_SCALE, oy + (pv - miny) * UV_SCALE)
        pieces[name] = verts
        return verts

    add_piece('front', front, lambda u, v: body_to_3d(u, v, False), False, 'body', fi['neck'])
    add_piece('back', back, lambda u, v: body_to_3d(u, v, True), True, 'body', bi['neck'])
    add_piece('sleeve_r', sleeve, lambda u, v: sleeve_to_3d(u, v, 1), False, 'sleeve')
    add_piece('sleeve_l', sleeve, lambda u, v: sleeve_to_3d(u, v, -1), True, 'sleeve')

    # ทำให้ normal ทุกชิ้นชี้ออกนอกตัว
    bm.normal_update()
    for name, verts in pieces.items():
        fs = set()
        for row in verts:
            for v in row:
                fs.update(v.link_faces)
        score = 0.0
        for f in fs:
            c = f.calc_center_median()
            if name.startswith('sleeve'):
                J, d, up = arm_frame(1 if name == 'sleeve_r' else -1)
                rel = c - J
                rel -= d * rel.dot(d)
            else:
                rel = Vector((c.x, c.y, 0))
            score += f.normal.dot(rel)
        if score < 0:
            bmesh.ops.reverse_faces(bm, faces=list(fs))
            print(f'[pattern] flipped {name}')

    F, Bk, SR, SL = pieces['front'], pieces['back'], pieces['sleeve_r'], pieces['sleeve_l']
    nvb = len(F)
    pairs = []
    # ตะเข็บข้าง + วงแขน (ฝั่ง +x = คอลัมน์สุดท้าย, ฝั่ง -x = คอลัมน์ 0)
    for col, sl in ((-1, SR), (0, SL)):
        for j in range(M_SIDE):
            pairs.append((F[j][col], Bk[j][col]))
        nus = len(sl[0])
        for k in range(K_ARM):
            j = M_SIDE - 1 + k
            pairs.append((F[j][col], sl[-1][k]))              # วงแขนหน้า <-> หัวแขนครึ่งหน้า
            pairs.append((Bk[j][col], sl[-1][nus - 1 - k]))   # วงแขนหลัง <-> หัวแขนครึ่งหลัง
        for j in range(NV_SLEEVE):
            pairs.append((sl[j][0], sl[j][-1]))               # ตะเข็บใต้แขน
    # ตะเข็บไหล่
    nuf, nub = len(F[0]), len(Bk[0])
    for k in range(S_SH):
        pairs.append((F[-1][k], Bk[-1][k]))
        pairs.append((F[-1][nuf - 1 - k], Bk[-1][nub - 1 - k]))
    for a, b in pairs:
        a[deform][G['seam']] = 1.0
        b[deform][G['seam']] = 1.0
        bm.edges.new((a, b))
    bm.verts.index_update()
    pair_idx = [(a.index, b.index) for a, b in pairs]

    # สุ่มเขย่าจุดเล็กน้อย ให้เสื้อไม่สมมาตรเป๊ะเหมือนผ้าจริง
    rng = np.random.default_rng(7)
    for v in bm.verts:
        v.co += Vector(rng.normal(0, 0.0015, 3))
    me = bpy.data.meshes.new('Shirt')
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new('Shirt', me)
    bpy.context.scene.collection.objects.link(ob)
    for g in groups:
        ob.vertex_groups.new(name=g)
    print(f'[pattern] verts {len(me.vertices)} faces {len(me.polygons)} seams {len(pair_idx)}')
    return ob, pair_idx


def cloth_setup(ob, sewing, frames, gravity_ramp=None, self_coll=True, grow=0.0):
    mod = ob.modifiers.new('Cloth', 'CLOTH')
    s = mod.settings
    s.quality = 10
    s.mass = 0.25
    s.air_damping = 1.5
    s.tension_stiffness = 12
    s.compression_stiffness = 12
    s.shear_stiffness = 6
    s.bending_stiffness = 0.2
    s.tension_damping = 5
    s.compression_damping = 5
    s.shear_damping = 5
    s.bending_damping = 0.5
    s.use_sewing_springs = sewing
    s.sewing_force_max = 0.0
    s.internal_friction = 0.0
    # ค่าติดลบ = ผ้าขยายตัวนิดหน่อยหลังเย็บ -> เกิดรอยย่นตามธรรมชาติ
    s.shrink_min = -grow
    c = mod.collision_settings
    c.collision_quality = 4
    c.distance_min = 0.004
    c.use_self_collision = self_coll
    c.self_distance_min = 0.003
    c.self_friction = 3
    mod.point_cache.frame_start = 1
    mod.point_cache.frame_end = frames
    if gravity_ramp:
        ew = s.effector_weights
        for f, g in gravity_ramp:
            ew.gravity = g
            ew.keyframe_insert('gravity', frame=f)
    return mod


def run_sim(frames):
    sc = bpy.context.scene
    sc.frame_start = 1
    sc.frame_end = frames
    for f in range(1, frames + 1):
        sc.frame_set(f)
        if f % 10 == 0:
            print(f'[sim] frame {f}/{frames}', flush=True)


def bake_to_mesh(ob, name):
    deps = bpy.context.evaluated_depsgraph_get()
    eo = ob.evaluated_get(deps)
    me = bpy.data.meshes.new_from_object(eo, preserve_all_data_layers=True, depsgraph=deps)
    me.name = name
    new = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(new)
    for vg in ob.vertex_groups:
        if vg.name not in new.vertex_groups:
            new.vertex_groups.new(name=vg.name)
    new.matrix_world = ob.matrix_world.copy()
    return new


def weld_pairs(ob, pairs):
    """รวมจุดที่เย็บติดกันให้เป็นจุดเดียว แล้วลบเส้นเย็บ"""
    parent = {}

    def find(a):
        while parent.get(a, a) != a:
            a = parent[a]
        return a
    for a, b in pairs:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[max(ra, rb)] = min(ra, rb)
    groups = {}
    for a, b in pairs:
        for x in (a, b):
            groups.setdefault(find(x), set()).add(x)
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.verts.ensure_lookup_table()
    gaps = []
    targetmap = {}
    for root, members in groups.items():
        vs = [bm.verts[i] for i in members]
        c = sum((v.co for v in vs), Vector()) / len(vs)
        gaps.append(max((v.co - c).length for v in vs))
        for v in vs:
            v.co = c
        for v in vs:
            if v.index != root:
                targetmap[v] = bm.verts[root]
    bmesh.ops.weld_verts(bm, targetmap=targetmap)
    loose = [e for e in bm.edges if not e.link_faces]
    bmesh.ops.delete(bm, geom=loose, context='EDGES')
    bm.to_mesh(ob.data)
    bm.free()
    gaps.sort()
    print(f'[weld] groups {len(groups)} gap median {gaps[len(gaps)//2]*1000:.1f} mm, max {gaps[-1]*1000:.1f} mm')


def clean_scene():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for m in list(bpy.data.meshes):
        bpy.data.meshes.remove(m)


def stage_sim():
    clean_scene()
    sc = bpy.context.scene
    sc.render.fps = 24
    man = make_mannequin()
    ob, pairs = build_garment()
    FR = 150
    cloth_setup(ob, True, FR, gravity_ramp=[(1, 0.0), (45, 0.0), (75, 1.0)], grow=0.025)
    run_sim(FR)
    res = bake_to_mesh(ob, 'ShirtSewn')
    bpy.data.objects.remove(ob, do_unlink=True)
    weld_pairs(res, pairs)
    man.hide_render = True
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(CACHE, 'sewn.blend'))
    print('[sim] saved sewn.blend')


# ---------------------------------------------------------------------------
# ปล่อยเสื้อลงบนแท่น
# ---------------------------------------------------------------------------
PED_R, PED_H = 0.30, 0.55


def stage_drape():
    bpy.ops.wm.open_mainfile(filepath=os.path.join(CACHE, 'sewn.blend'))
    src = bpy.data.objects['ShirtSewn']
    for o in list(bpy.data.objects):
        if o.name != 'ShirtSewn':
            bpy.data.objects.remove(o, do_unlink=True)
    # วางนอนหงาย (หน้าเสื้อขึ้น) ชายเสื้อหันมาทางกล้อง (-Y) แล้วเลื่อนให้ล้นขอบแท่นด้านหน้า
    me = src.data
    co = np.array([v.co[:] for v in me.vertices])
    center = (co.min(0) + co.max(0)) / 2
    R = Matrix.Rotation(math.radians(22), 4, 'Z') @ Matrix.Rotation(math.radians(-90), 4, 'X')
    me.transform(Matrix.Translation(-Vector(center)))
    me.transform(R)
    co = np.array([v.co[:] for v in me.vertices])
    lift = PED_H + 0.03 - co[:, 2].min()
    me.transform(Matrix.Translation((0.03, -0.11, lift)))
    me.update()
    # แท่น + พื้น
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=96, radius1=PED_R, radius2=PED_R, depth=PED_H,
                          matrix=Matrix.Translation((0, 0, PED_H / 2)))
    # ขอบบนมนนิดๆ ให้ผ้าไม่ติดคม
    bmesh.ops.bevel(bm, geom=[e for e in bm.edges if abs(e.verts[0].co.z - PED_H) < 1e-4 and abs(e.verts[1].co.z - PED_H) < 1e-4],
                    offset=0.012, segments=4, affect='EDGES', profile=0.5)
    # ฝาบนเป็น n-gon 96 เหลี่ยม -> แตกเป็นสามเหลี่ยมแบบพัด ให้ collision ทำงานแน่นอน
    caps = [f for f in bm.faces if len(f.verts) > 4]
    bmesh.ops.poke(bm, faces=caps)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    pme = bpy.data.meshes.new('Pedestal')
    bm.to_mesh(pme)
    bm.free()
    ped = bpy.data.objects.new('Pedestal', pme)
    bpy.context.scene.collection.objects.link(ped)
    ped.modifiers.new('Collision', 'COLLISION')
    ped.collision.thickness_outer = 0.004
    ped.collision.thickness_inner = 0.05
    ped.collision.cloth_friction = 40
    ped.collision.damping = 1.0
    bpy.ops.mesh.primitive_plane_add(size=6, location=(0, 0, 0))
    floor = bpy.context.object
    floor.name = 'Floor'
    floor.modifiers.new('Collision', 'COLLISION')
    floor.collision.cloth_friction = 6

    FR = 70   # ผ้านิ่งแล้วตั้งแต่ ~เฟรม 50 ถ้าปล่อยนานกว่านี้ชายเสื้อที่ห้อยจะค่อยๆ ดึงทั้งตัวไถลลง
    mod = cloth_setup(src, False, FR)
    mod.settings.bending_stiffness = 0.35
    mod.settings.air_damping = 2.0
    mod.settings.collider_friction = 1.0
    run_sim(FR)
    res = bake_to_mesh(src, 'ShirtDraped')
    bpy.data.objects.remove(src, do_unlink=True)
    bpy.data.objects.remove(floor, do_unlink=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(CACHE, 'draped.blend'))
    print('[drape] saved draped.blend')


# ---------------------------------------------------------------------------
# ตกแต่งหลัง sim: subdivision, ร่องตะเข็บ, พับขอบ, คอยางยืด, ความหนา
# ---------------------------------------------------------------------------
def vg_weights(ob):
    names = [g.name for g in ob.vertex_groups]
    W_ = {n: np.zeros(len(ob.data.vertices)) for n in names}
    for v in ob.data.vertices:
        for g in v.groups:
            W_[names[g.group]][v.index] = g.weight
    return W_


def apply_modifier(ob, mod):
    deps = bpy.context.evaluated_depsgraph_get()
    eo = ob.evaluated_get(deps)
    me = bpy.data.meshes.new_from_object(eo, preserve_all_data_layers=True, depsgraph=deps)
    old = ob.data
    ob.modifiers.clear()
    ob.data = me
    bpy.data.meshes.remove(old)


def subdivide(ob):
    m = ob.modifiers.new('Sub', 'SUBSURF')
    m.levels = 1
    m.render_levels = 1
    m.uv_smooth = 'PRESERVE_BOUNDARIES'
    m.boundary_smooth = 'ALL'
    apply_modifier(ob, m)


def boundary_loops(bm):
    bnd = [e for e in bm.edges if e.is_boundary]
    adj = {}
    for e in bnd:
        a, b = e.verts
        adj.setdefault(a, []).append(b)
        adj.setdefault(b, []).append(a)
    seen = set()
    loops = []
    for start in adj:
        if start in seen:
            continue
        loop = [start]
        seen.add(start)
        prev, cur = None, start
        while True:
            nxt = [n for n in adj[cur] if n is not prev and n not in seen]
            if not nxt:
                break
            prev, cur = cur, nxt[0]
            loop.append(cur)
            seen.add(cur)
        loops.append(loop)
    return loops


def inward_chain(v, steps):
    """จากจุดบนขอบ เดินเข้าไปในผืนผ้าตามแนวตั้งฉากกับขอบ"""
    out = [v]
    inner = [e.other_vert(v) for e in v.link_edges if not e.is_boundary]
    if not inner:
        return None
    # เลือกเส้นที่ตั้งฉากกับขอบที่สุด
    bnd = [e.other_vert(v) for e in v.link_edges if e.is_boundary]
    tdir = (bnd[0].co - bnd[-1].co).normalized() if len(bnd) >= 2 else Vector()
    cur = min(inner, key=lambda n: abs((n.co - v.co).normalized().dot(tdir)))
    prev = v
    out.append(cur)
    for _ in range(steps - 1):
        d = (cur.co - prev.co).normalized()
        cands = [e.other_vert(cur) for e in cur.link_edges if e.other_vert(cur) is not prev]
        if not cands:
            break
        nxt = max(cands, key=lambda n: (n.co - cur.co).normalized().dot(d))
        prev, cur = cur, nxt
        out.append(cur)
    return out


def finish_shirt(src, name, collar_up=None):
    """src: mesh ที่เย็บแล้ว (ยังเป็นความละเอียดตอน sim) -> คืน object สุดท้าย (2 วัสดุ: cotton, rib)"""
    ob = src
    subdivide(ob)
    Wt = vg_weights(ob)
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.verts.ensure_lookup_table()
    bm.normal_update()
    n0 = [v.normal.copy() for v in bm.verts]
    # ร่องตะเข็บ
    seam = Wt['seam']
    hem = Wt['hem']
    cuff = Wt['cuff']
    for v in bm.verts:
        i = v.index
        d = 0.0
        if seam[i] > 0.98:
            d = 0.0011
        elif seam[i] > 0.45:
            d = 0.0002
        # ตะเข็บเดินด้ายคู่ที่ชาย/ปลายแขน (~1.7 ซม. จากขอบ)
        e = max(hem[i], cuff[i])
        if 0.6 < e < 0.75:
            d = max(d, 0.0006)
        if d:
            v.co -= n0[i] * d
    bm.normal_update()

    loops = boundary_loops(bm)
    # เกลาขอบผ้าให้เรียบ (คอ / ชาย / ปลายแขน) ก่อนสร้างขอบพับและคอ
    for loop in loops:
        smooth_loop(loop, 12 if Wt['neck'][[v.index for v in loop]].mean() > 0.5 else 4)
    bm.normal_update()
    folds, collars = [], []
    for loop in loops:
        idx = [v.index for v in loop]
        kind = max((('hem', hem[idx].mean()), ('cuff', cuff[idx].mean()), ('neck', Wt['neck'][idx].mean())), key=lambda t: t[1])
        print(f'[finish] loop {len(loop)} verts -> {kind[0]} ({kind[1]:.2f})')
        if kind[0] in ('hem', 'cuff'):
            folds.append(loop)
        else:
            collars.append(loop)
    fold_data = [loop_frames(bm, l, 3) for l in folds]
    collar_data = [loop_frames(bm, l, 1) for l in collars]
    bm.to_mesh(ob.data)
    bm.free()

    # ความหนา 2 มม.
    s = ob.modifiers.new('Solid', 'SOLIDIFY')
    s.thickness = THICK
    s.offset = -1
    s.use_even_offset = False
    s.thickness_clamp = 1.0   # กันจุดพุ่งตรงรอยพับคม
    s.use_quality_normals = True
    s.use_rim = True
    apply_modifier(ob, s)

    parts = [ob]
    for fd in fold_data:
        parts.append(make_fold(fd))
    for cd in collar_data:
        parts.append(make_collar(cd, collar_up))

    mat_cotton = make_material('cotton', (0.72, 0.72, 0.70, 1), 0.85)
    mat_rib = make_material('rib', (0.76, 0.76, 0.74, 1), 0.88, rib=True)
    for p in parts:
        p.data.materials.clear()
        p.data.materials.append(mat_cotton)
        p.data.materials.append(mat_rib)
        mi = 1 if p.name.startswith('Collar') else 0
        for poly in p.data.polygons:
            poly.material_index = mi
    for o in bpy.context.scene.objects:
        o.select_set(False)
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.join()
    ob.name = name
    for vg in list(ob.vertex_groups):
        ob.vertex_groups.remove(vg)
    # smooth shading + ขอบคมเฉพาะมุมหักจริง
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    for f in bm.faces:
        f.smooth = True
    for e in bm.edges:
        if len(e.link_faces) == 2 and e.calc_face_angle(0) > math.radians(60):
            e.smooth = False
    bm.to_mesh(ob.data)
    bm.free()
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    longest = max(e.calc_length() for e in bm.edges)
    bm.free()
    print(f'[finish] longest edge {longest*1000:.1f} mm' + ('  !! SPIKE' if longest > 0.05 else ''))
    tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    print(f'[finish] {name}: {len(ob.data.vertices)} verts, {tris} tris')
    return ob, tris


def smooth_loop(loop, iters):
    n = len(loop)
    for _ in range(iters):
        pos = [v.co.copy() for v in loop]
        for k, v in enumerate(loop):
            v.co = pos[k] * 0.5 + (pos[k - 1] + pos[(k + 1) % n]) * 0.25
        # ดึงแถวถัดเข้าไปตามนิดนึง กันขอบหักมุม
        for k, v in enumerate(loop):
            for e in v.link_edges:
                if not e.is_boundary:
                    o = e.other_vert(v)
                    nb = [e2.other_vert(o) for e2 in o.link_edges]
                    o.co = o.co * 0.6 + (sum((x.co for x in nb), Vector()) / len(nb)) * 0.4


def loop_frames(bm, loop, steps):
    """เก็บตำแหน่ง/normal/ทิศเข้าเนื้อผ้า ของแต่ละจุดบนขอบ (ไว้สร้างพับขอบ/คอ)"""
    data = []
    for v in loop:
        ch = inward_chain(v, steps)
        if ch is None or len(ch) < steps + 1:
            ch = (ch or [v]) + [ch[-1] if ch else v] * (steps + 1 - len(ch or [v]))
        data.append(dict(p=[c.co.copy() for c in ch], n=[c.normal.copy() for c in ch]))
    return data


def make_fold(fd):
    """พับขอบชาย/ปลายแขน: ผ้าม้วนเข้าด้านในเป็นรูปตัว U แล้วทาบขึ้นไป ~2 ซม."""
    N = len(fd)
    R = THICK + 0.0002
    rows = []
    thetas = [0, 36, 72, 108, 144, 180]
    for k in range(N):
        p0 = fd[k]['p'][0]
        n = fd[k]['n'][0]
        u = (fd[k]['p'][1] - p0)
        u = (u - n * u.dot(n)).normalized()
        c = p0 - n * R
        col = [c + R * (math.cos(math.radians(t)) * n - math.sin(math.radians(t)) * u) for t in thetas]
        for j in range(1, len(fd[k]['p'])):
            col.append(fd[k]['p'][j] - fd[k]['n'][j] * (2 * R))
        rows.append(col)
    bm = bmesh.new()
    vv = [[bm.verts.new(c) for c in col] for col in rows]
    nrow = len(rows[0])
    for k in range(N):
        k2 = (k + 1) % N
        for j in range(nrow - 1):
            f = bm.faces.new((vv[k][j], vv[k2][j], vv[k2][j + 1], vv[k][j + 1]))
    bm.normal_update()
    # ทิศ normal ที่ต้องการ: ตรงช่วงโค้ง = ชี้ออกจากจุดศูนย์กลาง, ตรงช่วงทาบ = ชี้เข้าหาตัว (-n)
    flip = 0
    for k in range(N):
        n = fd[k]['n'][0]
        f = next(iter(set(vv[k][nrow - 2].link_faces) & set(vv[k][nrow - 1].link_faces)), None)
        if f is not None:
            flip += 1 if f.normal.dot(-n) < 0 else -1
    if flip > 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    me = bpy.data.meshes.new('Fold')
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new('Fold', me)
    bpy.context.scene.collection.objects.link(ob)
    s = ob.modifiers.new('Solid', 'SOLIDIFY')
    s.thickness = THICK
    s.offset = -1
    s.use_even_offset = False
    s.thickness_clamp = 1.0   # กันจุดพุ่งตรงรอยพับคม
    s.use_rim = True
    apply_modifier(ob, s)
    return ob


def make_collar(cd, up=None):
    """คอยางยืด (ผ้าริบพับสองชั้น) สูง 1.8 ซม. — แยกเป็นอีกชิ้น ใช้วัสดุ rib"""
    N0 = len(cd)
    P = np.array([d['p'][0][:] for d in cd])
    Nn = np.array([d['n'][0][:] for d in cd])
    In = np.array([d['p'][1][:] for d in cd])
    # resample ให้ละเอียดสม่ำเสมอ (~5 มม.)
    closed = np.vstack([P, P[:1]])
    L = plen(closed)
    cnt = max(48, int(L / 0.005))
    seg = np.linalg.norm(np.diff(closed, axis=0), axis=1)
    s = np.concatenate([[0], np.cumsum(seg)])
    tgt = np.linspace(0, s[-1], cnt, endpoint=False)

    def interp(arr):
        a2 = np.vstack([arr, arr[:1]])
        return np.stack([np.interp(tgt, s, a2[:, k]) for k in range(3)], 1)
    Pp, Np_, Ip = interp(P), interp(Nn), interp(In)
    H = 0.018
    h = 0.0019
    oc = -THICK / 2
    prof = [(-0.006, h), (0.0, h), (0.005, h), (0.010, h), (H - h, h)]
    for a in (60, 30, 0, -30, -60):
        prof.append((H - h + h * math.cos(math.radians(a)), h * math.sin(math.radians(a))))
    prof += [(H - h, -h), (0.010, -h), (0.005, -h), (0.0, -h), (-0.006, -h)]
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new('UVMap')
    ring = []
    for k in range(cnt):
        p = Vector(Pp[k])
        n = Vector(Np_[k]).normalized()
        t = Vector(Pp[(k + 1) % cnt] - Pp[k - 1]).normalized()
        w = (p - Vector(Ip[k]))
        w = (w - n * w.dot(n) - t * w.dot(t)).normalized()
        tilt = math.radians(18)
        dirv = (w * math.cos(tilt) - n * math.sin(tilt)).normalized()
        if up is not None:
            # เสื้อที่ใส่อยู่: คอยางยืดตั้งขึ้นรอบคอ
            u_ = Vector(up)
            u_ = (u_ - t * u_.dot(t)).normalized()
            dirv = (dirv * 0.35 + u_ * 0.65).normalized()
        nb = t.cross(dirv).normalized()
        if nb.dot(n) < 0:
            nb = -nb
        ring.append([bm.verts.new(p + dirv * a + nb * (b + oc)) for a, b in prof])
    plen_prof = np.concatenate([[0], np.cumsum([math.dist(prof[i], prof[i + 1]) for i in range(len(prof) - 1)])])
    np_ = len(prof)
    for k in range(cnt):
        k2 = (k + 1) % cnt
        for j in range(np_ - 1):
            f = bm.faces.new((ring[k][j], ring[k][j + 1], ring[k2][j + 1], ring[k2][j]))
            uu = [k, k, k + 1, k + 1]
            vv = [j, j + 1, j + 1, j]
            for loop, a, b in zip(f.loops, uu, vv):
                loop[uvl].uv = (a * L / cnt, plen_prof[b])
        # ปิดก้น (ซ่อนอยู่ใต้ผ้า)
        bm.faces.new((ring[k][np_ - 1], ring[k][0], ring[k2][0], ring[k2][np_ - 1]))
    # ทรงหลอดปิด -> ให้ Blender หันทุก normal ออกด้านนอก
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new('Collar')
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new('Collar', me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def make_material(name, color, rough, rib=False):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = color
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Sheen Weight'].default_value = 1.0
    bsdf.inputs['Sheen Roughness'].default_value = 0.8
    # เนื้อผ้า (bump ละเอียด) สำหรับภาพตรวจใน Blender
    tc = nt.nodes.new('ShaderNodeTexCoord')
    bump = nt.nodes.new('ShaderNodeBump')
    bump.inputs['Distance'].default_value = 0.0004
    bump.inputs['Strength'].default_value = 0.6
    if rib:
        wave = nt.nodes.new('ShaderNodeTexWave')
        wave.wave_type = 'BANDS'
        wave.bands_direction = 'X'
        wave.inputs['Scale'].default_value = 330.0
        nt.links.new(tc.outputs['UV'], wave.inputs['Vector'])
        nt.links.new(wave.outputs['Fac'], bump.inputs['Height'])
    else:
        noise = nt.nodes.new('ShaderNodeTexNoise')
        noise.inputs['Scale'].default_value = 2200.0
        noise.inputs['Detail'].default_value = 2.0
        nt.links.new(tc.outputs['Object'], noise.inputs['Vector'])
        nt.links.new(noise.outputs['Fac'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    return m


def export_glb(ob, path, origin='center'):
    me = ob.data
    co = np.array([v.co[:] for v in me.vertices])
    if origin == 'center':
        c = (co.min(0) + co.max(0)) / 2
    else:   # draped: จุดกึ่งกลางผิวบนของแท่น
        c = np.array([0, 0, PED_H])
    me.transform(Matrix.Translation(-Vector(c)))
    ob.location = (0, 0, 0)
    for o in bpy.context.scene.objects:
        o.select_set(o == ob)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True,
                              export_yup=True, export_normals=True, export_texcoords=True,
                              export_materials='EXPORT',
                              export_draco_mesh_compression_enable=True,
                              export_draco_mesh_compression_level=6,
                              export_draco_position_quantization=14,
                              export_draco_normal_quantization=10,
                              export_draco_texcoord_quantization=12)
    print(f'[export] {path} {os.path.getsize(path)/1024:.0f} KB')


def stage_export():
    report = {}
    for src_file, obj_name, out, origin in (('sewn.blend', 'ShirtSewn', 'tshirt.glb', 'center'),
                                            ('draped.blend', 'ShirtDraped', 'tshirt-draped.glb', 'pedestal')):
        p = os.path.join(CACHE, src_file)
        if not os.path.exists(p):
            print('[export] skip', src_file)
            continue
        bpy.ops.wm.open_mainfile(filepath=p)
        for o in list(bpy.data.objects):
            if o.name != obj_name:
                bpy.data.objects.remove(o, do_unlink=True)
        ob = bpy.data.objects[obj_name]
        fin, tris = finish_shirt(ob, out.replace('.glb', ''), (0, 0, 1) if origin == 'center' else None)
        report[out] = tris
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(CACHE, out.replace('.glb', '-final.blend')))
        export_glb(fin, os.path.join(MODELS, out), origin)
    with open(os.path.join(CACHE, 'export-report.json'), 'w') as f:
        json.dump(report, f, indent=1)


# ---------------------------------------------------------------------------
# QA render
# ---------------------------------------------------------------------------
def setup_studio(target_center, radius):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = int(os.environ.get('QA_SAMPLES', '64'))
    sc.cycles.use_denoising = True
    sc.render.resolution_x = 900
    sc.render.resolution_y = 1100
    sc.view_settings.view_transform = 'AgX'
    sc.view_settings.look = 'AgX - Medium High Contrast'
    world = bpy.data.worlds.new('W') if not bpy.data.worlds else bpy.data.worlds[0]
    sc.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (0.02, 0.022, 0.025, 1)
    bg.inputs['Strength'].default_value = 1.0
    c = Vector(target_center)

    def area(name, loc, power, size, color=(1, 1, 1)):
        ld = bpy.data.lights.new(name, 'AREA')
        ld.energy = power
        ld.size = size
        ld.color = color
        lo = bpy.data.objects.new(name, ld)
        sc.collection.objects.link(lo)
        lo.location = c + Vector(loc)
        lo.rotation_euler = (c - lo.location).to_track_quat('-Z', 'Y').to_euler()
        return lo
    area('Key', (-2.1, -0.7, 1.0), 170, 0.7, (1.0, 0.96, 0.9))
    area('Rim', (1.4, 1.5, 0.8), 260, 0.6, (0.8, 0.9, 1.0))
    area('Fill', (1.6, -1.4, -0.3), 10, 2.0)
    area('Top', (0, 0.3, 2.0), 35, 1.0)
    cam_d = bpy.data.cameras.new('Cam')
    cam_d.lens = 60
    cam = bpy.data.objects.new('Cam', cam_d)
    sc.collection.objects.link(cam)
    sc.camera = cam
    return cam


def stage_qa():
    jobs = [('tshirt-final.blend', 'tshirt', 'model'), ('tshirt-draped-final.blend', 'tshirt-draped', 'model-draped')]
    for f, obj, prefix in jobs:
        p = os.path.join(CACHE, f)
        if not os.path.exists(p):
            continue
        bpy.ops.wm.open_mainfile(filepath=p)
        ob = bpy.data.objects[obj]
        for o in list(bpy.data.objects):
            if o is not ob:
                bpy.data.objects.remove(o, do_unlink=True)
        co = np.array([ob.matrix_world @ v.co for v in ob.data.vertices])
        c = (co.min(0) + co.max(0)) / 2
        rad = float(np.linalg.norm(co.max(0) - co.min(0))) / 2
        if prefix == 'model-draped':
            bm = bmesh.new()
            bmesh.ops.create_cone(bm, cap_ends=True, segments=96, radius1=PED_R - 0.004, radius2=PED_R - 0.004, depth=PED_H,
                                  matrix=Matrix.Translation((0, 0, PED_H / 2)))
            pm = bpy.data.meshes.new('Ped')
            bm.to_mesh(pm)
            bm.free()
            ped = bpy.data.objects.new('Ped', pm)
            bpy.context.scene.collection.objects.link(ped)
            pmat = bpy.data.materials.new('ped')
            pmat.use_nodes = True
            pmat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.12, 0.12, 0.12, 1)
            pmat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.6
            ped.data.materials.append(pmat)
            c = np.array([0, 0, PED_H * 0.75])
            rad = 0.55
        cam = setup_studio(c, rad)
        dist = rad / math.tan(math.radians(14)) * 1.05
        views = {'front': (0, -1, 0.12), 'side': (1, 0, 0.12), 'back': (0, 1, 0.12), '34': (0.72, -0.72, 0.3)}
        for vname, dvec in views.items():
            d = Vector(dvec).normalized()
            cam.location = Vector(c) + d * dist
            cam.rotation_euler = (Vector(c) - cam.location).to_track_quat('-Z', 'Y').to_euler()
            bpy.context.scene.render.filepath = os.path.join(QA, f'{prefix}-{vname}.png')
            bpy.ops.render.render(write_still=True)
            print('[qa] wrote', bpy.context.scene.render.filepath, flush=True)
        # ภาพใกล้: คอเสื้อ + ปลายแขน
        if prefix == 'model':
            cam.data.lens = 85
            for vname, dvec, tgt, dd in (('closeup-collar', (0.35, -1, 0.75), (0, -0.03, c[2] + 0.27), 0.75),
                                          ('closeup-sleeve', (1, -0.6, -0.2), (0.33, -0.0, c[2] + 0.12), 0.7)):
                d = Vector(dvec).normalized()
                cam.location = Vector(tgt) + d * dd
                cam.rotation_euler = (Vector(tgt) - cam.location).to_track_quat('-Z', 'Y').to_euler()
                bpy.context.scene.render.filepath = os.path.join(QA, f'{prefix}-{vname}.png')
                bpy.ops.render.render(write_still=True)
                print('[qa] wrote', bpy.context.scene.render.filepath, flush=True)


if __name__ == '__main__':
    for st in ARGS:
        print(f'===== stage {st} =====', flush=True)
        {'sim': stage_sim, 'drape': stage_drape, 'export': stage_export, 'qa': stage_qa}[st]()

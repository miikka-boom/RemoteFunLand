# New Moves: three original dances for the robot of robot_CameraWork.blend, built from
# poses sampled out of its AerobicBlocking routine.
#
# Usage:  python tools/export_robots.py robot_CameraWork.blend dances.glb nomocap 0.5 tools/new_moves.py
# The exporter runs this after baking the original clips; it adds dance_signal, dance_static
# and dance_overdrive (64 counts each, 8 frames per count at 24 fps) to the exported GLB.
#
# Toolkit: a pose library sampled from the stepped routine (LIBFRAMES), and tools to mirror a
# pose left/right, mix the arms, legs and core of different poses, aim limbs in armature space
# (ARM_DIRS / LEG_DIRS), turn the body, tilt the chest, turn the head, and keep the feet on
# the floor with an optional jump height. A dance is a list of (count, pose, interpolation).
# Runs inside tools/export_robots.py and uses its D, sc, rig, ad, pbs, DEF, made, set_ik, fcs.
from mathutils import Vector, Matrix, Quaternion
import math

FPC = 8  # frames per count in the authored clips (24 fps -> 180 counts/min; the player retimes)
ARM_L = ['__LeftCollar', '__LeftShoulder', '__LeftElbow', '__LeftWrist']
ARM_R = [n.replace('Left', 'Right') for n in ARM_L]
LEG_L = ['__LeftHip', '__LeftKnee', '__LeftAnkle']
LEG_R = [n.replace('Left', 'Right') for n in LEG_L]
CORE = ['__Spine1', '__Spine2', '__Chest', '__Neck', '__Head']
ARMS, LEGS = ARM_L + ARM_R, LEG_L + LEG_R

def depth(n):
    b = rig.data.bones[n]; d = 0
    while b.parent: b = b.parent; d += 1
    return d
ORDER = sorted(DEF, key=depth)
swap = lambda n: n.replace('Left', '#').replace('Right', 'Left').replace('#', 'Right')
upd = lambda: bpy.context.view_layer.update()
REST = {n: rig.data.bones[n].matrix_local.to_3x3() for n in DEF}

set_ik(False)
for pb in pbs: pb.rotation_mode = 'QUATERNION'

def read():
    return {n: (pbs[n].location.copy(), pbs[n].rotation_quaternion.normalized()) for n in DEF}
def apply(P):
    for n in DEF:
        l, q = P[n]; pbs[n].location = l; pbs[n].rotation_quaternion = q
    upd()

# ---- pose library sampled from the baked stepped routine (phrase frames) ----
LIBFRAMES = {
    'marchR': 0, 'marchL': 8, 'pumpL': 24, 'pumpR': 32, 'jumpWide': 56, 'kick': 64,
    'bentWide': 72, 'V': 80, 'turnA': 96, 'turnB': 104, 'turnC': 112, 'highKneeL': 160,
    'highKneeR': 168, 'armsWide': 176, 'squat': 184, 'squat2': 192, 'tuck': 224, 'T': 232,
}
stepped = [a for a in made if a.name == 'aerobics_stepped'][0]
ad.action = stepped
if stepped.slots: ad.action_slot = stepped.slots[0]
LIB = {}
for name, f in LIBFRAMES.items():
    sc.frame_set(f); upd(); LIB[name] = read()
ad.action = None
for pb in pbs: pb.location = (0, 0, 0); pb.rotation_quaternion = (1, 0, 0, 0)
upd()

def foot_min():
    return min(min(pbs[n].head.z, pbs[n].tail.z) for n in ('__LeftAnkle', '__RightAnkle'))
apply(LIB['squat']); GROUND = foot_min()
UNIT = 1 / rig.scale.x  # armature units per world unit (~33.7)

# ---- pose tools (armature space: +Z up, +Y the robot's front, +X its right) ----
def aim(n, d):
    pb = pbs[n]; upd(); M = pb.matrix.copy()
    rot = M.col[1].xyz.normalized().rotation_difference(Vector(d).normalized())
    pb.matrix = Matrix.Translation(M.translation) @ (rot.to_matrix() @ M.to_3x3()).to_4x4()
    upd()
def turn_bone(n, axis, deg):
    pb = pbs[n]; upd(); M = pb.matrix.copy()
    R = Matrix.Rotation(math.radians(deg), 3, axis)
    pb.matrix = Matrix.Translation(M.translation) @ (R @ M.to_3x3()).to_4x4()
    upd()
def mirror(P):
    apply(P)
    S = Matrix.Diagonal((-1, 1, 1, 1))
    target = {swap(n): S @ pbs[n].matrix.copy() @ S for n in DEF}
    for n in ORDER:
        pbs[n].matrix = target[n]; upd()
    return read()
def yaw_hips(P, deg):
    l, q = P['__Hips']; R = REST['__Hips']
    qr = (R.inverted() @ Matrix.Rotation(math.radians(deg), 3, 'Z') @ R).to_quaternion()
    P = dict(P); P['__Hips'] = (l, qr @ q); return P
def ground(P, lift=0.0, travel=(0, 0)):
    apply(P)
    dz = (GROUND + lift * UNIT) - foot_min()
    off = REST['__Hips'].inverted() @ Vector((travel[0] * UNIT, travel[1] * UNIT, dz))
    l, q = P['__Hips']; P = dict(P); P['__Hips'] = (l + off, q); return P

# direction presets for the left side; the right side is mirrored in X
def L(d): return Vector(d).normalized()
def R(d): return Vector((-d[0], d[1], d[2])).normalized()
ARM_DIRS = {  # (upper arm, forearm, hand)
    'up':      ((-0.45, 0.05, 0.9), (-0.35, 0.08, 1), (-0.3, 0.12, 1)),  # outward enough to clear the head box
    'pump':    ((-0.85, 0.25, 0.25), (-0.1, 0.25, 1), (0, 0.3, 1)),     # fist up beside the head
    'diag':    ((-0.75, 0.05, 0.66), (-0.75, 0.05, 0.66), (-0.7, 0.1, 0.7)),
    'down':    ((-0.22, 0.05, -1), (-0.12, 0.12, -1), (-0.05, 0.2, -1)),
    'hip':     ((-0.55, -0.15, -0.8), (0.8, 0.2, -0.25), (0.9, 0.3, -0.2)),
    'side':    ((-1, 0, 0), (-1, 0, 0), (-1, 0, -0.2)),
    'robotUp': ((-1, 0.05, 0), (0, 0.15, 1), (0, 0.3, 1)),
    'robotDn': ((-1, 0.05, 0), (0, 0.15, -1), (0, 0.3, -1)),
    'front':   ((-0.15, 1, 0.05), (-0.05, 1, 0.1), (0, 1, 0)),
    'point':   ((-0.55, 0.25, 0.8), (-0.55, 0.25, 0.8), (-0.5, 0.3, 0.8)),
}
LEG_DIRS = {  # (thigh, shin)
    'open':   ((-0.38, 0, -1), (-0.36, 0, -1)),
    'wide':   ((-0.55, 0, -1), (-0.5, 0, -1)),
    'closed': ((-0.04, 0, -1), (0, 0, -1)),
    'side':   ((-0.18, 0, -1), (-0.16, 0, -1)),
    'cross':  ((0.32, -0.28, -1), (0.28, -0.3, -1)),   # crosses behind the other leg
    'tap':    ((-0.08, 0.35, -1), (-0.05, -0.25, -1)),
    'crouch': ((-0.45, 0.75, -0.55), (-0.15, -0.35, -1)),
    'knee':   ((-0.08, 1, -0.05), (-0.05, -0.05, -1)),  # thigh horizontal: high knee
}
def arm(side, key):
    names = ARM_L[1:] if side == 'L' else ARM_R[1:]
    f = L if side == 'L' else R
    for n, d in zip(names, ARM_DIRS[key]): aim(n, f(d))
def leg(side, key):
    names = LEG_L[:2] if side == 'L' else LEG_R[:2]
    f = L if side == 'L' else R
    for n, d in zip(names, LEG_DIRS[key]): aim(n, f(d))

def build(base='T', arms=None, legs=None, core=None, a=None, l=None, wave=None,
          tilt=0, head=0, mirror_it=False, yaw=0, lift=0.0, travel=(0, 0)):
    P = {n: LIB[base][n] for n in DEF}
    if arms: P.update({n: LIB[arms][n] for n in ARMS})
    if legs: P.update({n: LIB[legs][n] for n in LEGS})
    if core: P.update({n: LIB[core][n] for n in CORE})
    apply(P)
    if tilt: turn_bone('__Chest', 'Y', tilt)
    if a:  # arm presets: 'key' for both, or (left, right)
        la, ra = (a, a) if isinstance(a, str) else a
        if la: arm('L', la)
        if ra: arm('R', ra)
    if wave is not None: wave_arms(wave)
    if l:
        ll, rl = (l, l) if isinstance(l, str) else l
        if ll: leg('L', ll)
        if rl: leg('R', rl)
    if head: turn_bone('__Head', 'Z', head)
    P = read()
    if mirror_it: P = mirror(P)
    if yaw: P = yaw_hips(P, yaw)
    return ground(P, lift, travel)

def wave_arms(phase):
    # a bump travels from the left hand through both arms to the right hand; phase 0..6
    for side in ('L', 'R'):
        names = ARM_L[1:] if side == 'L' else ARM_R[1:]
        f = L if side == 'L' else R
        for seg, n in enumerate(names):
            j = (2 - seg) if side == 'L' else (3 + seg)
            bump = math.exp(-((phase - j) ** 2) / 0.7)
            aim(n, f((-1, 0.05, 0.05 + 1.5 * bump - 0.15 * (seg == 2))))

# ---- the three dances: lists of (count, pose kwargs, interpolation) ----
def dance_signal():
    K = []; S = 'CONSTANT'
    def half(off, m):
        mr = m
        for c in range(8):  # march & pump
            K.append((off + c, dict(base='marchR' if c % 2 == 0 else 'marchL', a=('pump', 'robotDn') if c % 2 == 0 else ('robotDn', 'pump'), mirror_it=mr), S))
        for c in range(8):  # dial turn: quarter turns in place every two counts, head snaps the other way
            K.append((off + 8 + c, dict(base='marchR' if c % 2 == 0 else 'marchL', a='robotUp' if c % 2 == 0 else 'robotDn',
                                        yaw=(90 * ((c + 1) // 2)) * (-1 if mr else 1), head=(-25 if c % 2 == 0 else 25), mirror_it=mr), S))
        K.append((off + 16, dict(base='squat', arms='V', mirror_it=mr), S))
        K.append((off + 18, dict(base='T', a=('hip', 'up'), l='side', head=-20, mirror_it=mr), S))
        K.append((off + 20, dict(base='T', a=('up', 'hip'), l='side', head=20, mirror_it=mr), S))
        K.append((off + 22, dict(base='squat', arms='V', mirror_it=mr), S))
        K.append((off + 23, dict(base='T', a='up', l='closed', lift=0.06, mirror_it=mr), S))
        for c in range(7):  # jumping jacks
            K.append((off + 24 + c, dict(base='T', a='diag' if c % 2 == 0 else 'down', l='open' if c % 2 == 0 else 'closed', lift=0.04, mirror_it=mr), S))
        K.append((off + 31, dict(base='tuck', lift=0.22, mirror_it=mr), S))
    half(0, False); half(32, True)
    K.append((63, dict(base='squat', arms='V'), S))
    return K

def dance_static():
    K = []; B = 'BEZIER'
    step = 0.22
    def vine(off, d, armset):  # grapevine 4 counts, d=+1 to the robot's right
        x0 = K[-1][1].get('travel', (0, 0))[0] if K else 0
        legs = [('side', 'side'), ('cross', None) if d > 0 else (None, 'cross'), ('side', 'side'), ('tap', None) if d > 0 else (None, 'tap')]
        for c in range(4):
            x = x0 + d * step * [1, 1.6, 2.6, 2.6][c]
            K.append((off + c, dict(base='T', a=armset[c % 2], l=legs[c], travel=(x, 0), head=12 * d), B))
    def half(off, first):
        vine(off, first, ('robotUp', 'robotDn')); vine(off + 4, -first, (('robotDn', 'robotUp'), ('robotUp', 'robotDn')))
        for i in range(13):  # arm wave, half counts, knees soft
            ph = i / 2 if first > 0 else 6 - i / 2
            K.append((off + 8 + i * 0.5, dict(base='squat2', wave=ph, lift=0.0, travel=(0, 0)), B))
        K.append((off + 14.5, dict(base='squat2', wave=3, travel=(0, 0)), B))
        for c in range(8):  # body roll: chest tilts with counter head, robot arms
            s = 1 if c % 2 == 0 else -1
            K.append((off + 16 + c, dict(base='T', a=('robotUp', 'robotDn') if s > 0 else ('robotDn', 'robotUp'), l='open', tilt=14 * s * first, head=-18 * s * first), B))
        for c in range(8):  # slow turn on a knee lift, arms rise from T to V
            arms = 'T' if c < 4 else 'V'
            K.append((off + 24 + c, dict(base='highKneeR' if first > 0 else 'highKneeL', arms=arms, yaw=45 * (c + 1) * first), B))
    half(0, 1); half(32, -1)
    K.append((63, dict(base='T', a=('hip', 'point'), l='side', head=-15), B))
    return K

def dance_overdrive():
    K = []; S = 'CONSTANT'; Lr = 'LINEAR'
    def half(off, m):
        for c in range(8):  # high knees, quick pumps
            K.append((off + c, dict(base='highKneeL' if c % 2 == 0 else 'highKneeR', a=('robotDn', 'pump') if c % 2 == 0 else ('pump', 'robotDn'), lift=0.05, yaw=(0 if off == 0 else 90 * (c // 2)) * (-1 if m else 1), mirror_it=m), S))
        for c in range(4):  # scissor kicks
            K.append((off + 8 + c, dict(base='kick', mirror_it=(c % 2 == 1) != m, lift=0.12), S))
        K.append((off + 12, dict(base='T', arms='V', l='wide', lift=0.3, mirror_it=m), S))   # star jump
        K.append((off + 13, dict(base='squat', a='down', mirror_it=m), S))
        K.append((off + 14, dict(base='T', arms='V', l='wide', lift=0.3, mirror_it=m), S))
        K.append((off + 15, dict(base='squat', a='front', mirror_it=m), S))
        for c in range(8):  # robot breakdown: low squat, arms snap, head ticks
            K.append((off + 16 + c, dict(base='squat', a=('robotUp', 'robotDn') if c % 2 == 0 else ('robotDn', 'robotUp'), head=[-30, 0, 30, 0][c % 4], mirror_it=m), S))
        K.append((off + 24, dict(base='T', a='down', l='crouch', mirror_it=m), S))           # spin jump
        K.append((off + 24.5, dict(base='tuck', lift=0.25, yaw=90, mirror_it=m), Lr))
        K.append((off + 25, dict(base='tuck', lift=0.3, yaw=180, mirror_it=m), Lr))
        K.append((off + 25.5, dict(base='tuck', lift=0.2, yaw=270, mirror_it=m), Lr))
        K.append((off + 26, dict(base='squat', a='side', yaw=359.9, mirror_it=m), S))
        K.append((off + 27, dict(base='squat', arms='armsWide', mirror_it=m), S))
        K.append((off + 28, dict(base='tuck', lift=0.1, mirror_it=m), S))
        K.append((off + 29, dict(base='squat', a='down', mirror_it=m), S))
        K.append((off + 30, dict(base='squat', arms='V', mirror_it=m), S))
        K.append((off + 31, dict(base='T', l='open', mirror_it=m), S))
    half(0, False); half(32, True)
    K.append((60, dict(base='T', arms='V', l='wide', lift=0.32), S))
    K.append((61, dict(base='squat', a='front'), S))
    K.append((62, dict(base='squat', arms='V'), S))
    K.append((63, dict(base='squat', arms='V'), S))
    return K

def author(name, keys, length=64):
    keys = sorted(keys, key=lambda k: k[0])
    # later keys at the same count win
    uniq = {}
    for c, kw, ip in keys: uniq[c] = (kw, ip)
    act = D.actions.new(name + '_src'); ad.action = act
    if act.slots: ad.action_slot = act.slots[0]
    prevq = {}
    for c in sorted(uniq):
        kw, ip = uniq[c]
        P = build(**kw); apply(P)
        f = c * FPC
        for n in DEF:
            pb = pbs[n]; q = pb.rotation_quaternion.copy()
            if n in prevq and prevq[n].dot(q) < 0: q.negate(); pb.rotation_quaternion = q
            prevq[n] = q
            pb.keyframe_insert('location', frame=f); pb.keyframe_insert('rotation_quaternion', frame=f)
    # give every key the interpolation of the move it belongs to
    for fc in fcs(act):
        for k in fc.keyframe_points:
            c = k.co.x / FPC
            k.interpolation = uniq[min(uniq, key=lambda u: abs(u - c))][1]
            if k.interpolation == 'BEZIER': k.handle_left_type = k.handle_right_type = 'AUTO_CLAMPED'
        fc.update()
    ad.action = None
    # bake to per-frame linear keys for glTF, like the original clips
    baked = D.actions.new(name); ad.action = act
    if act.slots: ad.action_slot = act.slots[0]
    samples = []
    for f in range(0, length * FPC + 1):
        sc.frame_set(f); upd(); samples.append(read())
    ad.action = baked
    if baked.slots: ad.action_slot = baked.slots[0]
    lastq = {}
    for f, P in enumerate(samples):
        for n in DEF:
            l, q = P[n]
            if n in lastq and lastq[n].dot(q) < 0: q = -q
            lastq[n] = q
            pbs[n].location = l; pbs[n].rotation_quaternion = q
            pbs[n].keyframe_insert('location', frame=f); pbs[n].keyframe_insert('rotation_quaternion', frame=f)
    for fc in fcs(baked):
        for k in fc.keyframe_points: k.interpolation = 'LINEAR'
    baked.use_fake_user = True
    ad.action = None
    D.actions.remove(act)
    print('authored', name, len(uniq), 'keys', len(samples), 'frames')
    return baked

for nm, fn in (('dance_signal', dance_signal), ('dance_static', dance_static), ('dance_overdrive', dance_overdrive)):
    made.append(author(nm, fn()))
for pb in pbs: pb.location = (0, 0, 0); pb.rotation_quaternion = (1, 0, 0, 0)
upd()

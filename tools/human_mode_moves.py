# Human Mode: extra poses for the "Human Mode" music video, on top of tools/new_moves.py.
#
# Usage:  python tools/export_robots.py robot_CameraWork.blend robots.glb all 0.5 tools/human_mode_moves.py
# ("all" keeps the mocap clip, which the video needs.) Adds the New Moves dances plus
# hm_poses: one held pose per count, stepped, sampled by the player at count = pose index:
#   0 stand   1 powered off   2 point right   3 point left   4 surprised   5 shrug   6 bow
# Runs inside tools/export_robots.py and uses its globals.
import os
exec(open(os.path.join(os.path.dirname(os.path.abspath(sys.argv[5])), 'new_moves.py')).read())

POSES = [
    dict(base='T', a='down', l='closed'),                                          # stand
    dict(base='T', a='down', l=('side', 'side'), slump=True),                       # powered off
    dict(base='T', a=('hip', 'front'), l='side', head=-10),                         # point right
    dict(base='T', a=('front', 'hip'), l='side', head=10),                          # point left
    dict(base='T', a='diag', l='open', lift=0.04),                                  # surprised
    dict(base='T', a='robotUp', l='side', head=12),                                 # shrug
    dict(base='T', a='down', l='closed', bow=True),                                 # bow
]

def build_hm(slump=False, bow=False, **kw):
    P = build(**kw)
    if not (slump or bow): return P
    apply(P)
    if slump:  # head drops forward, spine sags, knees soften
        turn_bone('__Head', 'X', -24); turn_bone('__Spine2', 'X', -10)
        leg('L', 'side'); leg('R', 'side')
    if bow:
        turn_bone('__Spine1', 'X', -38); turn_bone('__Head', 'X', -12)
    return ground(read(), kw.get('lift', 0.0))

act = D.actions.new('hm_poses_src'); ad.action = act
if act.slots: ad.action_slot = act.slots[0]
for i, kw in enumerate(POSES + [POSES[-1]]):
    apply(build_hm(**kw))
    for n in DEF:
        pbs[n].keyframe_insert('location', frame=i * FPC); pbs[n].keyframe_insert('rotation_quaternion', frame=i * FPC)
for fc in fcs(act):
    for k in fc.keyframe_points: k.interpolation = 'CONSTANT'
ad.action = None
baked = D.actions.new('hm_poses'); samples = []
ad.action = act
if act.slots: ad.action_slot = act.slots[0]
for f in range(0, len(POSES) * FPC + 1):
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
made.append(baked)
for pb in pbs: pb.location = (0, 0, 0); pb.rotation_quaternion = (1, 0, 0, 0)
upd()
print('authored hm_poses', len(POSES), 'poses')

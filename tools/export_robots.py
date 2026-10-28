# Export the dancers from robot_CameraWork.blend to glTF for antenna-aerobics/.
#
# Usage (Blender 4.4+ or the `bpy` pip package; tested with bpy 5.2):
#   python tools/export_robots.py robot_CameraWork.blend robots.glb all 0.5
#     argv[1]  the .blend file
#     argv[2]  output .glb
#     argv[3]  "all" also bakes the mocap clip; anything else skips it
#     argv[4]  how much of the mocap hip travel to keep (0.5 = half)
#   then embed it for the page (so it also works from file://):
#   { printf 'window.ROBOTS_GLB="'; base64 -w0 robots.glb; printf '";\n'; } > antenna-aerobics/robots.js
#
# What it does: keeps one robot (rig miikka_dance_long.003 + mesh Cube.001), the pedestal,
# the PARTY letters and the sphere; tags the dome, knob and antenna tip as separate
# materials; bakes AerobicBlocking (stepped, and a Bezier-smoothed copy), KristaWalk and
# 3,325 frames of the miikka_dance_long mocap onto the robot's FK bones (IK resolved);
# then exports GLB with those four clips only.
# Run it on a copy of the .blend: script auto-execution is turned off before loading.
import sys, bpy, mathutils, math
bpy.context.preferences.filepaths.use_scripts_auto_execute = False
bpy.ops.wm.open_mainfile(filepath=sys.argv[1], load_ui=False)
OUT=sys.argv[2]; MODE=sys.argv[3] if len(sys.argv)>3 else 'all'
D=bpy.data; sc=D.scenes[0]
for c in D.collections: c.hide_viewport=False; c.hide_render=False
rig=D.objects['miikka_dance_long.003']; body=D.objects['Cube.001']
keep={rig.name, body.name,'Circle','Text','Text.001','Text.002','Text.003','Text.004','Sphere'}
for o in list(D.objects):
    if o.name not in keep: D.objects.remove(o, do_unlink=True)
ad=rig.animation_data
for t in list(ad.nla_tracks): ad.nla_tracks.remove(t)
DEF=[g.name for g in body.vertex_groups]

import bmesh
def tag_parts():
    me=body.data
    names=['body','dome','knob','tip']
    me.materials.clear()
    for n in names:
        m=D.materials.get('rb_'+n) or D.materials.new('rb_'+n); me.materials.append(m)
    bm=bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table(); bm.faces.ensure_lookup_table()
    seen=set(); comps=[]
    for v in bm.verts:
        if v.index in seen: continue
        st=[v]; comp=set([v.index]); seen.add(v.index)
        while st:
            x=st.pop()
            for e in x.link_edges:
                y=e.other_vert(x)
                if y.index not in seen: seen.add(y.index); comp.add(y.index); st.append(y)
        comps.append(comp)
    def which(comp):
        vs=[bm.verts[i].co for i in comp]; n=len(vs)
        ymin=min(v.y for v in vs); zmax=max(v.z for v in vs); zmin=min(v.z for v in vs); xmax=max(v.x for v in vs)-min(v.x for v in vs)
        if n==37 and xmax>0.2: return 1
        if n==37: return 2
        if n==8 and zmin>1.0: return 3
        return 0
    idx={}
    for comp in comps:
        k=which(comp)
        for i in comp: idx[i]=k
    for f in bm.faces: f.material_index=idx[f.verts[0].index]
    bm.to_mesh(me); bm.free()
    print("tagged", {k:sum(1 for v in idx.values() if v==k) for k in range(4)})
tag_parts()
pbs=rig.pose.bones
ORIG={pb.name:pb.rotation_mode for pb in pbs}
def fcs(a): return [f for l in a.layers for s in l.strips for cb in s.channelbags for f in cb.fcurves]
def set_ik(on):
    for pb in pbs:
        for c in pb.constraints: c.mute = not on
def bake(src_action, name, f0, f1, step=1, ik=True, hips_fix=None):
    for pb in pbs: pb.rotation_mode=ORIG[pb.name]
    set_ik(ik); ad.action=src_action
    if src_action.slots: ad.action_slot=src_action.slots[0]
    frames=list(range(f0,f1+1,step)); samples=[]
    for f in frames:
        sc.frame_set(f); bpy.context.view_layer.update()
        row={}
        for n in DEF:
            pb=pbs[n]; m=rig.convert_space(pose_bone=pb, matrix=pb.matrix, from_space='POSE', to_space='LOCAL')
            l,q,s=m.decompose(); row[n]=(l.copy(),q.copy())
        samples.append(row)
    ad.action=None
    for pb in pbs: pb.location=(0,0,0); pb.rotation_quaternion=(1,0,0,0); pb.rotation_euler=(0,0,0); pb.scale=(1,1,1)
    if hips_fix: samples=hips_fix(samples)
    act=D.actions.new(name); ad.action=act; slot=ad.action_slot
    for pb in pbs: pb.rotation_mode='QUATERNION'
    for i,(f,row) in enumerate(zip(frames,samples)):
        t=f-f0
        prevq={}
        for n,(l,q) in row.items():
            pb=pbs[n]; pb.location=l
            if i>0:
                pq=samples[i-1][n][1]
                if pq.dot(q)<0: q.negate()
            pb.rotation_quaternion=q
            pb.keyframe_insert('location', frame=t); pb.keyframe_insert('rotation_quaternion', frame=t)
    for f in fcs(act):
        for k in f.keyframe_points: k.interpolation='LINEAR'
    act.use_fake_user=True
    ad.action=None
    print("baked", name, len(frames), "frames")
    return act
src=D.actions['AerobicBlocking.006']
made=[]
made.append(bake(src,'aerobics_stepped',0,253))
sm=src.copy(); sm.name='AerobicSmoothSrc'
for f in fcs(sm):
    for k in f.keyframe_points: k.interpolation='BEZIER'; k.handle_left_type='AUTO_CLAMPED'; k.handle_right_type='AUTO_CLAMPED'
    f.update()
made.append(bake(sm,'aerobics_smooth',0,253))
made.append(bake(D.actions['KristaWalk'],'walk',-2,20,ik=False))
if MODE=='all':
    def fixhips(samples):
        H=[r['__Hips'][0] for r in samples]
        n=len(H); mean=sum(H,mathutils.Vector())/n
        k=float(sys.argv[4]) if len(sys.argv)>4 else 0.5
        lowv=min(h.y for h in H)  # bone Y = up
        for r,h in zip(samples,H):
            d=(h-mean)*k
            r['__Hips']=(mathutils.Vector((d.x, (h.y-mean.y)*k, d.z)), r['__Hips'][1])
        return samples
    made.append(bake(D.actions['miikka_dance_long'],'mocap',1,3325,step=2,ik=False,hips_fix=fixhips))
set_ik(False)
for a in list(D.actions):
    if a not in made: D.actions.remove(a)
for pb in pbs: pb.rotation_mode='QUATERNION'
for pb in pbs:
    for c in list(pb.constraints): pb.constraints.remove(c)
# normalize placement: feet on z=0 at origin, facing -Y (toward viewer)
rig.location=(0,0,rig.location.z-1.378)
# props
def center(o, ground=True):
    dg=bpy.context.evaluated_depsgraph_get(); bb=[o.matrix_world@mathutils.Vector(c) for c in o.bound_box]
    cx=sum(v.x for v in bb)/8; cy=sum(v.y for v in bb)/8; zmin=min(v.z for v in bb); cz=sum(v.z for v in bb)/8
    o.location.x-=cx; o.location.y-=cy; o.location.z-= (zmin if ground else cz)
center(D.objects['Circle'])
txt=[D.objects[n] for n in ['Text','Text.001','Text.002','Text.003','Text.004']]
bb=[o.matrix_world@mathutils.Vector(c) for o in txt for c in o.bound_box]
cx=(min(v.x for v in bb)+max(v.x for v in bb))/2; zmin=min(v.z for v in bb); cy=(min(v.y for v in bb)+max(v.y for v in bb))/2
for o in txt: o.location.x-=cx; o.location.z-=zmin; o.location.y-=cy
center(D.objects['Sphere'], ground=False)
for o in txt+[D.objects['Sphere'],D.objects['Circle']]: o.data.materials.clear()
for o in txt: o.data.materials.append(D.materials.new('party_letter'))
D.objects['Sphere'].data.materials.append(D.materials.new('disco'))
D.objects['Circle'].data.materials.append(D.materials.new('pedestal'))
for o in D.objects: o.select_set(True)
bpy.context.view_layer.update()
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_animations=True,
    export_animation_mode='ACTIONS', export_skins=True, export_yup=True, export_apply=False,
    export_materials='EXPORT', export_def_bones=True, export_optimize_animation_size=True, export_force_sampling=False)
print("exported")

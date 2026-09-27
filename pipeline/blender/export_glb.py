import bpy, sys, json
argv=sys.argv[sys.argv.index("--")+1:]
blend, out, maskjson = argv[0], argv[1], argv[2]
bpy.ops.wm.open_mainfile(filepath=blend)
# push each action into an NLA-independent state; glTF exporter exports all actions as separate animations
arm=[o for o in bpy.data.objects if o.type=='ARMATURE'][0]
# unmute nothing; exporter uses actions via "Group by NLA" off + export all actions
for o in bpy.data.objects:
    if o.type not in ('ARMATURE','MESH'): o.hide_set(True)
bpy.ops.object.select_all(action='DESELECT')
arm.select_set(True)
for c in arm.children: c.select_set(True)
bpy.context.view_layer.objects.active=arm
masks=json.load(open(maskjson))
# brightness fix-ups for realtime (three.js) lighting; gain applied on sRGB pixel values
GAIN={"T_Guy_M_shirt": 1.65}
import numpy as np
for img in bpy.data.images:
    g=GAIN.get(img.name.split('.')[0])
    if g and img.size[0]>0:
        px=np.empty(len(img.pixels),np.float32); img.pixels.foreach_get(px); px=px.reshape(-1,4)
        px[:,:3]=np.clip(px[:,:3]*g,0,1); img.pixels.foreach_set(px.ravel()); img.pack(); print('GAIN',img.name,g)
for img in bpy.data.images:
    if img.size[0]==0: continue
    n=img.name.lower()
    lim=2048 if '_skin' in n else (512 if ('teeth' in n or 'eye' in n or 'lash' in n or 'brow' in n) else 1024)
    if max(img.size)>lim:
        img.scale(lim,lim); img.pack()
        print('SCALED',img.name,lim)
# store masks + custom props on armature for reference (not exported to gltf extras of meshes though)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True,
    export_apply=False, export_animations=True, export_animation_mode='ACTIONS',
    export_nla_strips=False, export_bake_animation=False,
    export_materials='EXPORT', export_image_format='AUTO',
    export_yup=True, export_skins=True, export_morph=True,
    export_def_bones=False, export_optimize_animation_size=True,
    export_texcoords=True, export_normals=True, export_tangents=False, export_vertex_color='ACTIVE', export_all_vertex_colors=False)
print("EXPORTED", out)

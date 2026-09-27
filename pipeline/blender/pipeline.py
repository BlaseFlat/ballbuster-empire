import bpy, bmesh, sys, json, importlib, os, math, random
import numpy as np
from mathutils import Vector, Matrix, kdtree

argv = sys.argv[sys.argv.index("--")+1:]
cfg = json.load(open(argv[0]))
P = "bl_ext.user_default.mpfb.services."
HS = importlib.import_module(P+"humanservice").HumanService
TS = importlib.import_module(P+"targetservice").TargetService
DATA_SYS = "/home/box/.config/blender/4.2/extensions/user_default/mpfb/data"
DATA_USR = "/home/box/.config/blender/4.2/extensions/.user/user_default/mpfb/data"
TEX = "/workspace/bb3d/tex/"
NAME = cfg["name"]
random.seed(3)

bpy.ops.wm.read_factory_settings(use_empty=True)
info = HS._create_default_human_info_dict()
info["name"] = NAME
info["phenotype"].update(cfg["phenotype"])
info["targets"] = [{"target": k, "value": v} for k, v in cfg.get("targets", {}).items()]
info["rig"] = "game_engine"
for bp in ["eyes","eyebrows","eyelashes","teeth","hair"]:
    if bp in cfg: info[bp] = cfg[bp]
info["clothes"] = cfg.get("clothes", [])
info["skin_mhmat"] = cfg["skin"]
info["skin_material_type"] = "MAKESKIN"
settings = HS.get_default_deserialization_settings()
settings["subdiv_levels"] = 0
settings["detailed_helpers"] = True
settings["extra_vertex_groups"] = False
settings["feet_on_ground"] = False
body = HS.deserialize_from_dict(info, settings)
arm = [o for o in bpy.data.objects if o.type == 'ARMATURE'][0]
arm.name = NAME + "_rig"; arm.data.name = NAME + "_rig"

def sel_only(o):
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True); bpy.context.view_layer.objects.active = o

# ---------- 1. bake targets, add expression shape keys ----------
TS.bake_targets(body)
race = "caucasian"
units_dir = f"{DATA_SYS}/targets/expression/units/{race}/"
exprs = cfg.get("expressions", {})
needed = sorted({u for e in exprs.values() for u in e})
if exprs:
    body.shape_key_add(name="Basis", from_mix=False)
    for u in needed:
        TS.load_target(body, units_dir + u + ".target.gz", weight=0.0, name="U_" + u)
    kb = body.data.shape_keys.key_blocks
    for ename, mix in exprs.items():
        for k in kb: 
            if k.name.startswith("U_"): k.value = 0.0
        for u, w in mix.items(): kb["U_" + u].value = w
        sk = body.shape_key_add(name=ename, from_mix=True)
        sk.value = 0.0
    for k in list(kb):
        if k.name.startswith("U_"): body.shape_key_remove(k)
    for k in body.data.shape_keys.key_blocks: k.value = 0.0

# ---------- 2. figure out hidden verts; delete helpers, keep masks as info ----------
vg = {g.name: g.index for g in body.vertex_groups}
me = body.data
nv = len(me.vertices)
in_body = np.zeros(nv, bool)
del_groups = {}
for g in body.vertex_groups:
    if g.name.startswith("Delete."):
        del_groups[g.name[7:]] = np.zeros(nv, bool)
for v in me.vertices:
    for ge in v.groups:
        if ge.group == vg["body"] and ge.weight > 0.5: in_body[v.index] = True
        for dn in del_groups:
            if ge.group == vg["Delete." + dn] and ge.weight > 0.5: del_groups[dn][v.index] = True
for m in list(body.modifiers):
    if m.type == 'MASK': body.modifiers.remove(m)
# delete non-body (helper) verts with bmesh (keeps shape keys)
bm = bmesh.new(); bm.from_mesh(me)
bm.verts.ensure_lookup_table()
# store per-vertex "hidden by outfit" flag in a vertex group before deletion
for dn, arr in del_groups.items():
    g = body.vertex_groups.get("Delete." + dn)
kill = [bm.verts[i] for i in range(nv) if not in_body[i]]
bmesh.ops.delete(bm, geom=kill, context='VERTS')
bm.to_mesh(me); bm.free()
me.update()
print("BODY verts after helper delete", len(me.vertices))

# ---------- 3. join accessories (eyes, brows, lashes, teeth) into body, transfer shape keys ----------
def all_meshes():
    return [o for o in bpy.data.objects if o.type == 'MESH']
acc_keys = ["high-poly", "eyebrow", "eyelashes", "teeth", "tongue", "low-poly"]
accs = [o for o in all_meshes() if any(k in o.name for k in acc_keys)]
body_co = np.array([v.co[:] for v in me.vertices])
kd = kdtree.KDTree(len(body_co))
for i, c in enumerate(body_co): kd.insert(c, i)
kd.balance()
if me.shape_keys:
    key_deltas = {}
    base = np.array([v.co[:] for v in me.shape_keys.key_blocks["Basis"].data])
    for k in me.shape_keys.key_blocks:
        if k.name == "Basis": continue
        key_deltas[k.name] = np.array([v.co[:] for v in k.data]) - base
    for o in accs:
        # add shape keys by nearest-vertex delta (average of 3 nearest)
        o.shape_key_add(name="Basis", from_mix=False)
        mw = o.matrix_world; bw_inv = body.matrix_world.inverted()
        cos = [bw_inv @ (mw @ v.co) for v in o.data.vertices]
        nn = [kd.find_n(c, 3) for c in cos]
        for kname, d in key_deltas.items():
            sk = o.shape_key_add(name=kname, from_mix=False)
            for vi, lst in enumerate(nn):
                w = np.array([1.0 / (x[2] + 1e-4) for x in lst]); w /= w.sum()
                dd = sum(w[j] * d[lst[j][1]] for j in range(len(lst)))
                sk.data[vi].co = o.data.vertices[vi].co + Vector(dd)
for o in accs:
    for m in list(o.modifiers):
        if m.type != 'ARMATURE': o.modifiers.remove(m)
bpy.ops.object.select_all(action='DESELECT')
for o in accs: o.select_set(True)
body.select_set(True); bpy.context.view_layer.objects.active = body
bpy.ops.object.join()
body.name = NAME + "_body"

# ---------- helpers for materials ----------
def load_img(path, name=None):
    img = bpy.data.images.load(path, check_existing=True)
    if name: img.name = name
    return img

def img_to_np(img):
    a = np.array(img.pixels[:], dtype=np.float32).reshape(img.size[1], img.size[0], img.channels)
    return a

def np_to_img(arr, name, alpha=True):
    h, w, c = arr.shape
    img = bpy.data.images.new(name, w, h, alpha=alpha)
    if c == 3:
        arr = np.dstack([arr, np.ones((h, w, 1), np.float32)])
    img.pixels[:] = arr.ravel()
    img.pack()
    return img

def resized(img, maxs):
    if max(img.size) > maxs:
        img.scale(maxs, maxs)
    return img

def principled(name, base_img=None, color=(1,1,1,1), normal_img=None, rough=0.6, metal=0.0, alpha_clip=False, spec=0.5, normal_strength=1.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; nodes = nt.nodes
    bsdf = nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    bsdf.inputs["Base Color"].default_value = color
    if base_img:
        t = nodes.new("ShaderNodeTexImage"); t.image = base_img
        nt.links.new(t.outputs["Color"], bsdf.inputs["Base Color"])
        if alpha_clip:
            nt.links.new(t.outputs["Alpha"], bsdf.inputs["Alpha"])
            m.blend_method = 'CLIP' if hasattr(m, "blend_method") else None
    if normal_img:
        normal_img.colorspace_settings.name = 'Non-Color'
        t2 = nodes.new("ShaderNodeTexImage"); t2.image = normal_img
        nm = nodes.new("ShaderNodeNormalMap"); nm.inputs["Strength"].default_value = normal_strength
        nt.links.new(t2.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    m.use_backface_culling = not alpha_clip
    return m

def find_tex(mat, key):
    if not mat or not mat.node_tree: return None
    for n in mat.node_tree.nodes:
        if n.type == 'TEX_IMAGE' and n.name.startswith(key) and n.image: return n.image
    return None

def tint(img, rgb, name, gamma=1.0, maxs=1024, sat=None):
    img = resized(img, maxs)
    a = img_to_np(img).copy()
    c = a[..., :3]
    if sat is not None:
        g = c.mean(axis=2, keepdims=True); c = g + (c - g) * sat
    c = np.clip(c, 0, 1) ** gamma * np.array(rgb, np.float32)
    a[..., :3] = np.clip(c, 0, 1)
    if a.shape[2] == 3: a = np.dstack([a, np.ones(a.shape[:2] + (1,), np.float32)])
    return np_to_img(a, name)

# ---------- 4. body materials ----------
skin_cfg = cfg["skin_tint"]
for slot in body.material_slots:
    m = slot.material
    n = m.name if m else ""
    if n.endswith(".body") or n == NAME + ".body":
        d = find_tex(m, "diffuseTexture")
        img = tint(d, skin_cfg[:3], "T_" + NAME + "_skin", gamma=skin_cfg[3] if len(skin_cfg) > 3 else 1.0, maxs=2048)
        slot.material = principled("M_skin", img, rough=0.5)
    elif "high-poly" in n or "low-poly" in n:
        d = find_tex(m, "diffuseTexture")
        slot.material = principled("M_eye", resized(d, 512), rough=0.1, alpha_clip=True)
    elif "eyebrow" in n:
        d = find_tex(m, "diffuseTexture")
        slot.material = principled("M_brow", tint(d, cfg["hair_tint"][:3], "T_" + NAME + "_brow", maxs=512), rough=0.8, alpha_clip=True)
    elif "eyelash" in n:
        d = find_tex(m, "diffuseTexture")
        slot.material = principled("M_lash", tint(d, (0.3, 0.3, 0.3), "T_" + NAME + "_lash", maxs=512), rough=0.8, alpha_clip=True)
    elif "teeth" in n or "tongue" in n:
        d = find_tex(m, "diffuseTexture")
        slot.material = principled("M_teeth", resized(d, 256) if d else None, rough=0.3)

# ---------- 5. clothes/hair materials per config ----------
for o in all_meshes():
    if o == body: continue
    for key, spec in cfg.get("materials", {}).items():
        if key in o.name:
            m = o.material_slots[0].material
            d = find_tex(m, "diffuseTexture"); nrm = find_tex(m, "normalmapTexture")
            img = tint(d, spec["tint"], "T_" + NAME + "_" + spec["name"], gamma=spec.get("gamma", 1.0), maxs=spec.get("size", 1024), sat=spec.get("sat")) if d else None
            if nrm: nrm = resized(nrm, spec.get("size", 1024))
            nm = principled(spec["name"], img, normal_img=nrm, rough=spec.get("rough", 0.7), alpha_clip=spec.get("alpha", False))
            o.material_slots[0].material = nm
            o.name = NAME + "_" + spec["obj"]
            for m2 in list(o.modifiers):
                if m2.type != 'ARMATURE': o.modifiers.remove(m2)

# ---------- 6. custom shorts ----------
def world_bone_head(bname):
    return arm.matrix_world @ arm.data.bones[bname].head_local
def world_bone_tail(bname):
    return arm.matrix_world @ arm.data.bones[bname].tail_local

def make_shorts(scfg):
    hip = world_bone_head("thigh_l"); knee = world_bone_head("calf_l")
    L = hip.z - knee.z
    z_w = hip.z + scfg["waist"] * L
    z_h = hip.z - scfg["hem"] * L
    slit_h = scfg["slit"] * L
    arm_groups = {body.vertex_groups[n].index for n in body.vertex_groups.keys() if any(k in n for k in ["upperarm", "lowerarm", "hand", "index", "middle", "ring", "pinky", "thumb"])}
    mw = body.matrix_world
    bm = bmesh.new(); bm.from_mesh(body.data)
    bm.verts.ensure_lookup_table(); bm.faces.ensure_lookup_table()
    deform = bm.verts.layers.deform.active
    def thigh_axis(side, z):
        h = world_bone_head("thigh_" + side); t = world_bone_tail("thigh_" + side)
        if z < t.z:
            h = world_bone_head("calf_" + side); t = world_bone_tail("calf_" + side)
        f = (h.z - z) / (h.z - t.z)
        return h.lerp(t, max(0.0, min(1.0, f)))
    ok_v = {}
    for v in bm.verts:
        co = mw @ v.co
        dv = v[deform]
        armw = sum(w for gi, w in dv.items() if gi in arm_groups)
        if armw > 0.05: ok_v[v.index] = False; continue
        if co.z > z_w: ok_v[v.index] = False; continue
        if co.z > hip.z + 0.02: ok_v[v.index] = True; continue
        side = "l" if co.x > 0 else "r"
        ax = thigh_axis(side, co.z)
        dx = abs(co.x) - abs(ax.x); dy = co.y - ax.y
        ang = math.atan2(dy, dx)  # 0 = lateral
        hem = z_h + slit_h * max(0.0, 1.0 - abs(ang) / scfg["slit_w"])
        # inner thigh slightly longer (fight shorts cut)
        hem -= scfg.get("inner_drop", 0.0) * L * max(0.0, -math.cos(ang))
        ok_v[v.index] = co.z >= hem
    faces = [f for f in bm.faces if sum(ok_v.get(v.index, False) for v in f.verts) >= scfg.get('min_ok', 2) and f.material_index == 0 and all((mw @ v.co).z <= z_w + 0.01 for v in f.verts)]
    # only skin material faces (index of M_skin)
    face_idx = {f.index for f in faces}
    # boundary ring faces stay visible on body
    edge_face_idx = set()
    for f in faces:
        for e in f.edges:
            if any(lf.index not in face_idx for lf in e.link_faces):
                edge_face_idx.add(f.index)
    # build shorts mesh
    new = bmesh.new()
    dl = new.verts.layers.deform.verify()
    uvl_src = bm.loops.layers.uv.active
    uvl = new.loops.layers.uv.new("UVMap")
    vmap = {}
    for f in faces:
        for v in f.verts:
            if v.index not in vmap:
                nvv = new.verts.new(v.co + v.normal * scfg["offset"])
                for gi, w in v[deform].items(): nvv[dl][gi] = w
                vmap[v.index] = nvv
    for f in faces:
        try:
            nf = new.faces.new([vmap[v.index] for v in f.verts])
        except ValueError:
            continue
        for l_src, l_dst in zip(f.loops, nf.loops):
            l_dst[uvl].uv = l_src[uvl_src].uv
        cz = (mw @ f.calc_center_median()).z
        nf.material_index = 1 if (cz > z_w - scfg["band"] * L or cz < z_h + scfg.get("cuff", 0.0) * L) else 0
    # snap verts below hem curve up onto hem, on body surface
    from mathutils.bvhtree import BVHTree
    bvh = BVHTree.FromBMesh(bm)
    for nvv in new.verts:
        co = mw @ nvv.co
        if co.z > hip.z + 0.02: continue
        side = "l" if co.x > 0 else "r"
        ax = thigh_axis(side, co.z)
        dx = abs(co.x) - abs(ax.x); dy = co.y - ax.y
        ang = math.atan2(dy, dx)
        hem = z_h + slit_h * max(0.0, 1.0 - abs(ang) / scfg["slit_w"]) - scfg.get("inner_drop", 0.0) * L * max(0.0, -math.cos(ang))
        if co.z < hem + 0.004:
            tgt = Vector((co.x, co.y, hem))
            loc, nrm, idx, dist = bvh.find_nearest(mw.inverted() @ tgt)
            if loc is not None:
                nvv.co = loc + nrm * scfg["offset"]
    # smooth a bit (not boundary)
    for it in range(scfg.get("smooth", 3)):
        bmesh.ops.smooth_vert(new, verts=[v for v in new.verts if not v.is_boundary], factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    mesh = bpy.data.meshes.new(NAME + "_" + scfg["obj"])
    new.to_mesh(mesh); new.free()
    ob = bpy.data.objects.new(NAME + "_" + scfg["obj"], mesh)
    bpy.context.scene.collection.objects.link(ob)
    ob.matrix_world = body.matrix_world
    for g in body.vertex_groups: ob.vertex_groups.new(name=g.name)
    ob.parent = arm
    ob.matrix_parent_inverse = body.matrix_parent_inverse.copy()
    ob.matrix_world = body.matrix_world
    mod = ob.modifiers.new("Armature", 'ARMATURE'); mod.object = arm
    sol = ob.modifiers.new("Solidify", 'SOLIDIFY'); sol.thickness = scfg["thick"]; sol.offset = 1.0; sol.use_rim = True
    sel_only(ob)
    bpy.ops.object.modifier_move_to_index(modifier="Solidify", index=0)
    bpy.ops.object.modifier_apply(modifier="Solidify")
    bpy.ops.object.shade_smooth()
    fab_n = load_img(TEX + "fabric_normal.png", "T_fabric_normal")
    ob.data.materials.append(principled(scfg["mat"], None, color=tuple(scfg["color"]) + (1,), normal_img=fab_n, rough=0.85, normal_strength=0.3))
    ob.data.materials.append(principled(scfg["mat"] + "_band", None, color=tuple(scfg["band_color"]) + (1,), normal_img=fab_n, rough=0.6, normal_strength=0.6))
    hidden = face_idx - edge_face_idx
    return ob, hidden

extra_hidden = {}
for gc in cfg.get("gen_clothes", []):
    ob, hidden = make_shorts(gc)
    extra_hidden[gc["obj"].replace("outfit_", "")] = hidden

# ---------- 7. ponytail ----------
def make_ponytail(pcfg):
    hair = [o for o in all_meshes() if o.name.endswith("_hair")][0]
    mw = hair.matrix_world
    cos = [mw @ v.co for v in hair.data.vertices]
    head_h = world_bone_head("head"); head_t = world_bone_tail("head")
    # tie point = hair vertex maximizing back+up score
    best = max(cos, key=lambda c: (c.y - head_h.y) * pcfg["back_w"] + (c.z - head_h.z))
    tie = best + Vector(pcfg["tie_offset"])
    Lp = pcfg["length"]
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    dl = bm.verts.layers.deform.verify()
    # bones: pony chain
    nb = 4
    chain_pts = []
    def path(t, spread, ang, phase, lenf):
        # centerline: from tie go back/up then fall down along back
        s = t * Lp * lenf
        up0 = pcfg["lift"]
        # param curve in (y back, z up)
        y = tie.y + pcfg["back"] * math.sin(min(1.0, t * 1.6) * math.pi / 2) * lenf + 0.02 * t
        z = tie.z + up0 * math.sin(min(t * 3.0, 1.0) * math.pi) * 0.5 - (s * 0.92) * (t ** 0.9)
        x = tie.x
        # spread / fan-out grows along length
        r = spread * (0.25 + 1.2 * t)
        x += r * math.cos(ang)
        y += r * math.sin(ang) * 0.6
        # messy wave
        x += pcfg["mess"] * math.sin(t * 7 + phase) * t
        y += pcfg["mess"] * 0.6 * math.cos(t * 5 + phase * 1.3) * t
        return Vector((x, y, z))
    head_gi = hair.vertex_groups["head"].index if "head" in hair.vertex_groups else None
    NS = pcfg["strands"]
    SEG = 10
    for si in range(NS):
        spread = random.uniform(0.004, pcfg["spread"])
        ang = random.uniform(0, 2 * math.pi)
        phase = random.uniform(0, 6.28)
        lenf = random.uniform(0.7, 1.05)
        wroot = random.uniform(0.014, 0.026); wtip = random.uniform(0.005, 0.011)
        pts = [path(i / SEG, spread, ang, phase, lenf) for i in range(SEG + 1)]
        u0 = random.choice([0.0, 0.5]); u1 = u0 + 0.5
        prev = None
        for i, p in enumerate(pts):
            t = i / SEG
            tang = (pts[min(i + 1, SEG)] - pts[max(i - 1, 0)]).normalized()
            radial = Vector((math.cos(ang), math.sin(ang) * 0.6, 0.0))
            side = tang.cross(radial).normalized() if tang.cross(radial).length > 1e-4 else Vector((1, 0, 0))
            w = wroot * (1 - t) + wtip * t
            a = bm.verts.new(p - side * w); b = bm.verts.new(p + side * w)
            # weights: along chain
            f = t * nb
            for vv in (a, b):
                for k in range(nb):
                    wk = max(0.0, 1.0 - abs(f - (k + 0.5)))
                    if t < 0.08: wk *= t / 0.08
                    if wk > 0: vv[dl][100 + k] = wk
                if t < 0.12:
                    vv[dl][99] = 1.0 - t / 0.12
            if prev:
                fc = bm.faces.new([prev[0], prev[1], b, a])
                for l in fc.loops:
                    vi = l.vert
                    # uv: root at v=1
                    pass
                fc.loops[0][uvl].uv = (u0, 1 - (i - 1) / SEG)
                fc.loops[1][uvl].uv = (u1, 1 - (i - 1) / SEG)
                fc.loops[2][uvl].uv = (u1, 1 - i / SEG)
                fc.loops[3][uvl].uv = (u0, 1 - i / SEG)
            prev = (a, b)
        if si == 0:
            chain_pts = [path(k / nb, 0, 0, 0, 1.0) for k in range(nb + 1)]
    mesh = bpy.data.meshes.new(NAME + "_ponytail")
    bm.to_mesh(mesh); bm.free()
    ob = bpy.data.objects.new(NAME + "_ponytail", mesh)
    bpy.context.scene.collection.objects.link(ob)
    # vertex groups with indices 99..103 -> need to create groups up to 104
    names = {}
    for i in range(104):
        nm = "head" if i == 99 else ("pony_%02d" % (i - 99) if i >= 100 else "_unused%d" % i)
        ob.vertex_groups.new(name=nm)
    # add bones
    sel_only(arm)
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm.data.edit_bones
    inv = arm.matrix_world.inverted()
    parent = eb["head"]
    for k in range(nb):
        b = eb.new("pony_%02d" % (k + 1))
        b.head = inv @ chain_pts[k]; b.tail = inv @ chain_pts[k + 1]
        b.parent = parent; b.use_connect = (k > 0)
        parent = b
    bpy.ops.object.mode_set(mode='OBJECT')
    # cleanup unused groups
    for g in list(ob.vertex_groups):
        if g.name.startswith("_unused"): ob.vertex_groups.remove(g)
    ob.parent = arm
    mod = ob.modifiers.new("Armature", 'ARMATURE'); mod.object = arm
    img = load_img(TEX + "hair_strands.png", "T_hair_strands")
    ob.data.materials.append(principled("M_hair_cards", img, rough=0.45, alpha_clip=True))
    sel_only(ob); bpy.ops.object.shade_smooth()
    return ob

if "ponytail" in cfg:
    make_ponytail(cfg["ponytail"])


# ---------- 8. outfit hide masks (UV triangles dumped to json) ----------
masks = {}
me = body.data
uvl = me.uv_layers.active.data
gi_map = {g.name: g.index for g in body.vertex_groups}
vmem = {}
for dn in cfg.get("outfit_map", {}):
    gname = "Delete." + dn
    if gname not in gi_map: continue
    gi = gi_map[gname]
    s_ = set()
    for v in me.vertices:
        for ge in v.groups:
            if ge.group == gi and ge.weight > 0.5: s_.add(v.index)
    vmem[cfg["outfit_map"][dn]] = s_
skin_idx = [i for i, sl in enumerate(body.material_slots) if sl.material and sl.material.name.startswith("M_skin")][0]
for key, vs in vmem.items():
    tris = []
    for p in me.polygons:
        if p.material_index == skin_idx and all(v in vs for v in p.vertices):
            tris.append([list(uvl[li].uv) for li in p.loop_indices])
    masks[key] = tris
for key, fidx in extra_hidden.items():
    tris = []
    for p in me.polygons:
        if p.index in fidx:
            tris.append([list(uvl[li].uv) for li in p.loop_indices])
    masks[key] = tris
json.dump(masks, open(cfg["mask_json"], "w"))
print("MASKS", {k: len(v) for k, v in masks.items()})

# ---------- 8b. zone vertex colors (R=top, G=bottom, B=feet) for outfit-driven skin hiding ----------
zone_of = cfg.get("zones", {})
col = me.color_attributes.new(name="Col", type='BYTE_COLOR', domain='POINT')
zc = [[0.0, 0.0, 0.0, 1.0] for _ in range(len(me.vertices))]
chan = {"top": 0, "bottom": 1, "feet": 2}
for key, vs in vmem.items():
    ch = chan.get(zone_of.get(key, ""), None)
    if ch is None: continue
    for vi in vs: zc[vi][ch] = 1.0
for key, fidx in extra_hidden.items():
    ch = chan.get(zone_of.get(key, ""), None)
    if ch is None: continue
    vf = {}
    for p in me.polygons:
        for vi in p.vertices:
            vf.setdefault(vi, []).append(p.index in fidx)
    for vi, flags in vf.items():
        if all(flags): zc[vi][ch] = 1.0
for i, c in enumerate(zc): col.data[i].color = c
print("ZONES", {k: sum(1 for c in zc if c[chan[k]] > 0.5) for k in chan})

# ---------- 9. scale to target height ----------
zs = [(body.matrix_world @ v.co).z for v in body.data.vertices]
hgt = max(zs) - min(zs)
sfac = cfg["height_m"] / hgt
print("HEIGHT", hgt, "-> scale", sfac)
arm.scale = (sfac, sfac, sfac)
bpy.context.view_layer.update()
zs = [(body.matrix_world @ v.co).z for v in body.data.vertices]
arm.location.z -= min(zs)
bpy.context.view_layer.update()
bpy.ops.object.select_all(action='DESELECT')
arm.select_set(True)
for o in arm.children: o.select_set(True)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.transform_apply(location=True, rotation=False, scale=True, properties=False)
# put feet on floor (z=0)
zs = [(body.matrix_world @ v.co).z for v in body.data.vertices]
print("FINAL HEIGHT", max(zs) - min(zs), "minz", min(zs))

# ---------- 10. cleanup vertex groups not in rig ----------
bones = set(arm.data.bones.keys())
for o in arm.children:
    if o.type != 'MESH': continue
    for g in list(o.vertex_groups):
        if g.name not in bones: o.vertex_groups.remove(g)
    o.data.name = o.name
# name the clothes objects by outfit
for o in arm.children: print("CHILD", o.name, len(o.data.vertices) if o.type=='MESH' else '')
bpy.ops.wm.save_as_mainfile(filepath=cfg["out_blend"])
print("SAVED", cfg["out_blend"])

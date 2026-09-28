import bpy, bmesh, sys, json, importlib, os, math, random
import numpy as np
from mathutils import Vector, Matrix, kdtree, Quaternion

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
settings["extra_vertex_groups"] = bool(cfg.get("skin_mat", {}).get("paint")) or "hairline" in cfg or "hair_shell" in cfg
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

def principled(name, base_img=None, color=(1,1,1,1), normal_img=None, rough=0.6, metal=0.0, alpha_clip=False, spec=0.5, normal_strength=1.0, extra=None):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; nodes = nt.nodes
    bsdf = nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Specular IOR Level"].default_value = spec
    # optional extras (exported as KHR_materials_* where glTF supports them)
    for k, v in (extra or {}).items():
        if k in bsdf.inputs: bsdf.inputs[k].default_value = v
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

def tint(img, rgb, name, gamma=1.0, maxs=1024, sat=None, alpha_blur=0):
    img = resized(img, maxs)
    a = img_to_np(img).copy()
    if alpha_blur and a.shape[2] == 4:
        # smooth blocky alpha contours (hairline) so the realtime alpha-test edge is a clean curve
        r = int(alpha_blur); k = np.ones(2 * r + 1, np.float32) / (2 * r + 1)
        al = a[..., 3]
        al = np.apply_along_axis(lambda m: np.convolve(m, k, 'same'), 0, al)
        al = np.apply_along_axis(lambda m: np.convolve(m, k, 'same'), 1, al)
        noise = np.random.default_rng(3).standard_normal(al.shape).astype(np.float32)
        noise = np.apply_along_axis(lambda m: np.convolve(m, np.ones(9, np.float32) / 9, 'same'), 0, noise)  # streaky
        edge = np.clip(1 - np.abs(al - 0.5) * 2.5, 0, 1)
        a[..., 3] = np.clip(al + edge * noise * 0.25, 0, 1)
    c = a[..., :3]
    if sat is not None:
        g = c.mean(axis=2, keepdims=True); c = g + (c - g) * sat
    c = np.clip(c, 0, 1) ** gamma * np.array(rgb, np.float32)
    a[..., :3] = np.clip(c, 0, 1)
    if a.shape[2] == 3: a = np.dstack([a, np.ones(a.shape[:2] + (1,), np.float32)])
    return np_to_img(a, name)

# ---------- 4. body materials ----------
skin_cfg = cfg["skin_tint"]
SK = cfg.get("skin_mat", {}); EY = cfg.get("eye_mat", {})

def skin_fix(img, fx):
    """Optional region fix-ups on the skin albedo (UV-space rectangles, 0..1): e.g. neutralise baked eyeshadow.
    fx: list of {"rect":[u0,v0,u1,v1], "sat":s, "mul":[r,g,b], "blur":0}"""
    w, h = img.size
    a = np.array(img.pixels[:], np.float32).reshape(h, w, 4)
    for f in fx:
        u0, v0, u1, v1 = f["rect"]
        x0, x1, y0, y1 = int(u0 * w), int(u1 * w), int(v0 * h), int(v1 * h)
        c = a[y0:y1, x0:x1, :3]
        if "sat" in f:
            g = c.mean(axis=2, keepdims=True); c = g + (c - g) * f["sat"]
        if "mul" in f: c = c * np.array(f["mul"], np.float32)
        a[y0:y1, x0:x1, :3] = np.clip(c, 0, 1)
    img.pixels[:] = a.ravel(); img.pack()

def add_rough_map(mat, img, rc, base):
    """Roughness variation map (glTF metallicRoughness.G): base +/- high-pass albedo detail + low-freq noise,
    optional per-vertex-group offsets (e.g. lips glossier)."""
    size = rc.get("size", 512)
    w, h = img.size
    a = np.array(img.pixels[:], np.float32).reshape(h, w, 4)[..., :3]
    f = w // size; a = a[:size * f, :size * f].reshape(size, f, size, f, 3).mean(axis=(1, 3))
    L = a @ np.array([0.3, 0.59, 0.11], np.float32)
    def blur(x, r):
        k = np.ones(2 * r + 1, np.float32) / (2 * r + 1)
        x = np.apply_along_axis(lambda m: np.convolve(np.pad(m, r, mode='wrap'), k, 'valid'), 0, x)
        return np.apply_along_axis(lambda m: np.convolve(np.pad(m, r, mode='wrap'), k, 'valid'), 1, x)
    rng = np.random.default_rng(5)
    n = blur(rng.standard_normal(L.shape).astype(np.float32), 8); n /= (n.std() + 1e-6)
    R = base + rc.get("detail", 1.5) * (L - blur(L, 4)) + rc.get("noise", 0.04) * n
    if rc.get("pores"):
        pn = rng.standard_normal(L.shape).astype(np.float32); pn = pn - blur(pn, 1)
        R = R + rc["pores"] * pn / (pn.std() + 1e-6)
    if rc.get("mid"):
        mn = blur(rng.standard_normal(L.shape).astype(np.float32), 3); mn /= (mn.std() + 1e-6)
        R = R + rc["mid"] * mn
    R = np.clip(R, 0.05, 1.0)
    im = bpy.data.images.new("T_" + NAME + "_skin_r", size, size, alpha=False)
    im.colorspace_settings.name = 'Non-Color'
    im.pixels[:] = np.dstack([R, R, R, np.ones_like(R)]).astype(np.float32).ravel(); im.pack()
    nt = mat.node_tree; t = nt.nodes.new("ShaderNodeTexImage"); t.image = im
    nt.links.new(t.outputs["Color"], nt.nodes["Principled BSDF"].inputs["Roughness"])

def skin_mottle(img, mc):
    """Subtle low-frequency albedo variation (redness/blotches) so the skin doesn't read as flat plastic."""
    w, h = img.size
    a = np.array(img.pixels[:], np.float32).reshape(h, w, 4)
    rng = np.random.default_rng(mc.get("seed", 3)); sc_ = mc.get("scale", 32)
    def up(n, H, W):
        # bicubic-ish smooth upsampling of a coarse noise grid (bilinear of a smoothstep-weighted grid)
        gh, gw = n.shape; ys = np.linspace(0, gh - 1.001, H); xs = np.linspace(0, gw - 1.001, W)
        y0 = ys.astype(int); x0 = xs.astype(int); fy = ys - y0; fx = xs - x0
        fy = fy * fy * (3 - 2 * fy); fx = fx * fx * (3 - 2 * fx)
        a_ = n[y0][:, x0]; b_ = n[y0][:, x0 + 1]; c_ = n[y0 + 1][:, x0]; d_ = n[y0 + 1][:, x0 + 1]
        top = a_ * (1 - fx) + b_ * fx; bot = c_ * (1 - fx) + d_ * fx
        return top * (1 - fy)[:, None] + bot * fy[:, None]
    big = up(rng.standard_normal((h // sc_ + 2, w // sc_ + 2)).astype(np.float32), h, w); big /= (big.std() + 1e-6)
    f4 = max(2, sc_ // 4)
    fine = up(rng.standard_normal((h // f4 + 2, w // f4 + 2)).astype(np.float32), h, w); fine /= (fine.std() + 1e-6)
    amp = mc.get("amp", 0.05); red = mc.get("red", 0.5)
    m = 1 + amp * big + amp * 0.5 * fine
    a[..., 0] *= m * (1 + red * amp * big); a[..., 1] *= m; a[..., 2] *= m * (1 - 0.3 * amp * big)
    img.pixels[:] = np.clip(a, 0, 1).ravel()

def skin_paint(img, pg):
    """Tint the albedo inside a body vertex group's UV footprint (e.g. 'lips'), soft-edged.
    pg: {"group":"lips", "mul":[r,g,b], "strength":1.0, "blur":3}"""
    gi = body.vertex_groups[pg["group"]].index
    inset = set(v.index for v in body.data.vertices if any(g.group == gi and g.weight > 0.5 for g in v.groups))
    w, h = img.size
    m = np.zeros((h, w), np.float32)
    uvd = body.data.uv_layers.active.data
    for poly in body.data.polygons:
        if not all(vi in inset for vi in poly.vertices): continue
        pts = [np.array(uvd[li].uv) * (w, h) for li in poly.loop_indices]
        for k in range(1, len(pts) - 1):
            A, B, C = pts[0], pts[k], pts[k + 1]
            x0, y0 = np.floor(np.minimum(np.minimum(A, B), C)).astype(int); x1, y1 = np.ceil(np.maximum(np.maximum(A, B), C)).astype(int)
            xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
            den = (B[1] - C[1]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[1] - C[1])
            if abs(den) < 1e-9: continue
            l1 = ((B[1] - C[1]) * (xs - C[0]) + (C[0] - B[0]) * (ys - C[1])) / den
            l2 = ((C[1] - A[1]) * (xs - C[0]) + (A[0] - C[0]) * (ys - C[1])) / den
            ins = (l1 >= -0.01) & (l2 >= -0.01) & (1 - l1 - l2 >= -0.01)
            yy = np.clip(np.arange(y0, y1 + 1), 0, h - 1); xx = np.clip(np.arange(x0, x1 + 1), 0, w - 1)
            sub = m[np.ix_(yy, xx)]; sub[ins] = 1.0; m[np.ix_(yy, xx)] = sub
    r = pg.get("blur", 3)
    if r:
        k = np.ones(2 * r + 1, np.float32) / (2 * r + 1)
        m = np.apply_along_axis(lambda x: np.convolve(x, k, 'same'), 0, m)
        m = np.apply_along_axis(lambda x: np.convolve(x, k, 'same'), 1, m)
    a = np.array(img.pixels[:], np.float32).reshape(h, w, 4)
    t = (m * pg.get("strength", 1.0))[..., None]
    a[..., :3] = np.clip(a[..., :3] * (1 - t) + a[..., :3] * np.array(pg["mul"], np.float32) * t, 0, 1)
    img.pixels[:] = a.ravel(); img.pack()
    print("PAINT", pg["group"], int((m > 0.5).sum()), "px")

def skin_detail_normal(img, dcfg, name=None):
    """Cheap micro-detail normal map from the albedo's high-frequency luminance (pores/creases), tangent space."""
    size = dcfg.get("size", 1024)
    w, h = img.size
    a = np.array(img.pixels[:], np.float32).reshape(h, w, 4)[..., :3]
    if w != size:
        f = w // size; a = a[:size * f, :size * f].reshape(size, f, size, f, 3).mean(axis=(1, 3))
    L = a @ np.array([0.3, 0.59, 0.11], np.float32)
    def blur(x, r):
        k = np.ones(2 * r + 1, np.float32) / (2 * r + 1)
        x = np.apply_along_axis(lambda m: np.convolve(np.pad(m, r, mode='wrap'), k, 'valid'), 0, x)
        return np.apply_along_axis(lambda m: np.convolve(np.pad(m, r, mode='wrap'), k, 'valid'), 1, x)
    hp = L - blur(L, dcfg.get("radius", 6))
    rng = np.random.default_rng(7)
    noise = rng.standard_normal(L.shape).astype(np.float32)
    noise = noise - blur(noise, 2)
    H = hp * dcfg.get("albedo", 4.0) + noise * dcfg.get("pores", 0.02)
    gy, gx = np.gradient(H)
    n = np.dstack([-gx, -gy, np.ones_like(H)])
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    out = np.dstack([n * 0.5 + 0.5, np.ones_like(H)]).astype(np.float32)
    im = bpy.data.images.new(name or ("T_" + NAME + "_skin_n"), size, size, alpha=False)
    im.colorspace_settings.name = 'Non-Color'
    im.pixels[:] = out.ravel(); im.pack()
    return im
for slot in body.material_slots:
    m = slot.material
    n = m.name if m else ""
    if n.endswith(".body") or n == NAME + ".body":
        d = find_tex(m, "diffuseTexture")
        img = tint(d, skin_cfg[:3], "T_" + NAME + "_skin", gamma=skin_cfg[3] if len(skin_cfg) > 3 else 1.0, maxs=2048, sat=SK.get("sat"))
        if SK.get("fix"): skin_fix(img, SK["fix"])
        for pg in SK.get("paint", []): skin_paint(img, pg)
        if SK.get("mottle"): skin_mottle(img, SK["mottle"])
        nrm = skin_detail_normal(img, SK["detail"]) if SK.get("detail") else None
        slot.material = principled("M_skin", img, rough=SK.get("rough", 0.5), spec=SK.get("spec", 0.5), normal_img=nrm, normal_strength=SK.get("normal_strength", 1.0), extra=SK.get("extra"))
        if SK.get("rough_map"): add_rough_map(slot.material, img, SK["rough_map"], SK.get("rough", 0.5))
    elif "high-poly" in n or "low-poly" in n:
        d = find_tex(m, "diffuseTexture")
        if EY.get("tex"): d = load_img(f"{DATA_USR}/eyes/materials/{EY['tex']}_eye.png", "T_eye_src")
        if EY.get("tint"): d = tint(d, EY["tint"], "T_" + NAME + "_eye", maxs=512, gamma=EY.get("gamma", 1.0))
        slot.material = principled("M_eye", resized(d, 512), rough=EY.get("rough", 0.1), spec=EY.get("spec", 0.5), alpha_clip=True)
    elif "eyebrow" in n:
        d = find_tex(m, "diffuseTexture")
        bt = cfg.get("brow_tint", cfg["hair_tint"])[:3]
        slot.material = principled("M_brow", tint(d, bt, "T_" + NAME + "_brow", maxs=512), rough=0.8, alpha_clip=True) if d else principled("M_brow", None, color=tuple(cfg.get("brow_color", (0.02, 0.015, 0.012))) + (1,), rough=0.7)
    elif "eyelash" in n:
        d = find_tex(m, "diffuseTexture")
        slot.material = principled("M_lash", tint(d, tuple(cfg.get("lash_tint", (0.3, 0.3, 0.3))), "T_" + NAME + "_lash", maxs=512), rough=0.8, alpha_clip=True) if d else principled("M_lash", None, color=(0.01, 0.01, 0.01, 1), rough=0.6)
    elif "teeth" in n or "tongue" in n:
        d = find_tex(m, "diffuseTexture")
        slot.material = principled("M_teeth", resized(d, 256) if d else None, rough=0.3)

# ---------- 5. clothes/hair materials per config ----------
for o in all_meshes():
    if o == body: continue
    for key, spec in cfg.get("materials", {}).items():
        if key in o.name:
            m = o.material_slots[0].material
            d = find_tex(m, "diffuseTexture"); nrm = None if spec.get("no_normal") else find_tex(m, "normalmapTexture")
            img = tint(d, spec["tint"], "T_" + NAME + "_" + spec["name"], gamma=spec.get("gamma", 1.0), maxs=spec.get("size", 1024), sat=spec.get("sat"), alpha_blur=spec.get("alpha_blur", 0)) if d else None
            if nrm: nrm = resized(nrm, spec.get("size", 1024))
            if not nrm and spec.get("detail") and img: nrm = skin_detail_normal(img, spec["detail"], "T_" + NAME + "_" + spec["name"] + "_n")
            nm = principled(spec["name"], img, normal_img=nrm, rough=spec.get("rough", 0.7), alpha_clip=spec.get("alpha", False), spec=spec.get("spec", 0.5), normal_strength=spec.get("normal_strength", 1.0), extra=spec.get("extra"))
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
        if scfg.get("clean_hem") and nvv.is_boundary and co.z > z_w - scfg["clean_hem"]:
            # clean, level waistband line
            loc, nrm, idx, dist = bvh.find_nearest(mw.inverted() @ Vector((co.x, co.y, z_w)))
            if loc is not None: nvv.co = loc + nrm * scfg["offset"]
            continue
        if co.z > hip.z + 0.02: continue
        side = "l" if co.x > 0 else "r"
        ax = thigh_axis(side, co.z)
        dx = abs(co.x) - abs(ax.x); dy = co.y - ax.y
        ang = math.atan2(dy, dx)
        hem = z_h + slit_h * max(0.0, 1.0 - abs(ang) / scfg["slit_w"]) - scfg.get("inner_drop", 0.0) * L * max(0.0, -math.cos(ang))
        if co.z < hem + 0.004 or (scfg.get("clean_hem") and nvv.is_boundary and co.z < hem + scfg.get("clean_hem")):
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
    ob.data.materials.append(principled(scfg["mat"], None, color=tuple(scfg["color"]) + (1,), normal_img=fab_n, rough=scfg.get("rough", 0.85), spec=scfg.get("spec", 0.5), normal_strength=scfg.get("normal_strength", 0.3), extra=scfg.get("extra")))
    ob.data.materials.append(principled(scfg["mat"] + "_band", None, color=tuple(scfg["band_color"]) + (1,), normal_img=fab_n, rough=scfg.get("band_rough", 0.6), normal_strength=0.6))
    hidden = face_idx - edge_face_idx
    return ob, hidden

extra_hidden = {}
for gc in cfg.get("gen_clothes", []):
    ob, hidden = make_shorts(gc)
    extra_hidden[gc["obj"].replace("outfit_", "")] = hidden

def orient_faces(bm, want):
    """Flip faces whose winding disagrees with the desired (custom) vertex normals, so renderers that flip the
    shading normal on back-face hits (Cycles, three.js DoubleSide) shade the cards correctly."""
    bm.normal_update(); flip = []
    for f in bm.faces:
        ns = [want[v] for v in f.verts if v in want]
        if ns and f.normal.dot(sum(ns, Vector())) < 0: flip.append(f)
    if flip: bmesh.ops.reverse_faces(bm, faces=flip)
    return len(flip)

# ---------- 7. ponytail ----------
PONY_TIE = [None]; PONY_CHAIN = [None]
def hair_card_material(pcfg):
    img = load_img(TEX + pcfg.get("tex", "hair_strands.png"), "T_hair_strands")
    tn = pcfg.get("tint")
    cap = bpy.data.images.get("T_" + NAME + "_M_hair")
    if pcfg.get("match_cap") and cap:
        # match the cards' average opaque colour to the (tinted) hair-cap texture
        def mean_rgb(im):
            a_ = np.array(im.pixels[:], np.float32).reshape(-1, 4); m_ = a_[:, 3] > 0.5
            return a_[m_, :3].mean(0)
        tn = (mean_rgb(cap) / np.maximum(mean_rgb(img), 1e-4) * pcfg.get("match_gain", 1.0)).tolist()
        print("CARD TINT", [round(x, 3) for x in tn])
    if tn: img = tint(img, tn, "T_" + NAME + "_hair_cards", maxs=1024, gamma=pcfg.get("gamma", 1.0))
    return principled("M_hair_cards", img, rough=pcfg.get("rough", 0.45), spec=pcfg.get("spec", 0.5), alpha_clip=True)

def make_ponytail(pcfg):
    hair = [o for o in all_meshes() if o.name.endswith("_hair")][0]
    if "cut_tail" in pcfg:
        # remove the hair asset's own (thin) tail so the card ponytail replaces it
        hh = world_bone_head("head"); dz, dy = pcfg["cut_tail"]
        bmh = bmesh.new(); bmh.from_mesh(hair.data); hmw = hair.matrix_world
        kill = [v for v in bmh.verts if (hmw @ v.co).z < hh.z + dz and (hmw @ v.co).y > hh.y + dy]
        bmesh.ops.delete(bmh, geom=kill, context='VERTS'); bmh.to_mesh(hair.data); bmh.free()
        print("CUT TAIL verts", len(kill))
    mw = hair.matrix_world
    cos = [mw @ v.co for v in hair.data.vertices]
    head_h = world_bone_head("head"); head_t = world_bone_tail("head")
    # tie point = hair vertex maximizing back+up score
    best = max(cos, key=lambda c: (c.y - head_h.y) * pcfg["back_w"] + (c.z - head_h.z))
    tie = best + Vector(pcfg["tie_offset"])
    if "tie_rel_head" in pcfg: tie = head_h + Vector(pcfg["tie_rel_head"])
    PONY_TIE[0] = tie
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
        r = spread * (pcfg.get("root_r", 0.25) + 1.2 * max(0.0, t - pcfg.get("gather", 0.0)))
        x += r * math.cos(ang)
        y += r * math.sin(ang) * pcfg.get("radial_y", 0.6)
        if pcfg.get("root_sink") and t < 0.12:
            k_ = 1 - t / 0.12; y -= pcfg["root_sink"] * k_; z -= pcfg["root_sink"] * 0.3 * k_
        # messy wave
        x += pcfg["mess"] * math.sin(t * 7 + phase) * t
        y += pcfg["mess"] * 0.6 * math.cos(t * 5 + phase * 1.3) * t
        return Vector((x, y, z))
    head_gi = hair.vertex_groups["head"].index if "head" in hair.vertex_groups else None
    NS = pcfg["strands"]
    SEG = 10; PONY_N = {}
    for si in range(NS):
        spread = random.uniform(0.004, pcfg["spread"])
        ang = random.uniform(0, 2 * math.pi)
        phase = random.uniform(0, 6.28)
        lenf = random.uniform(0.7, 1.05)
        wroot = random.uniform(0.014, 0.026) * pcfg.get("width", 1.0); wtip = random.uniform(0.005, 0.011) * pcfg.get("width", 1.0)
        pts = [path(i / SEG, spread, ang, phase, lenf) for i in range(SEG + 1)]
        u0 = random.choice([0.0, 0.5]); u1 = u0 + 0.5
        prev = None
        for i, p in enumerate(pts):
            t = i / SEG
            tang = (pts[min(i + 1, SEG)] - pts[max(i - 1, 0)]).normalized()
            radial = Vector((math.cos(ang), math.sin(ang) * pcfg.get("radial_y", 0.6), 0.0))
            side = tang.cross(radial).normalized() if tang.cross(radial).length > 1e-4 else Vector((1, 0, 0))
            w = wroot * (1 - t) + wtip * t
            w *= min(1.0, pcfg.get("root_narrow", 1.0) + (1 - pcfg.get("root_narrow", 1.0)) * t / 0.2)
            a = bm.verts.new(p - side * w); b = bm.verts.new(p + side * w)
            ctr = path(t, 0.0, 0.0, 0.0, lenf); rn = (p - ctr); rn = rn.normalized() if rn.length > 1e-5 else radial
            rn = (rn + Vector(pcfg.get("normal_bias", (0, 0, 0)))).normalized()
            PONY_N[a] = rn; PONY_N[b] = rn
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
                vt = pcfg.get("v_top", 1.0)
                fc.loops[0][uvl].uv = (u0, vt * (1 - (i - 1) / SEG))
                fc.loops[1][uvl].uv = (u1, vt * (1 - (i - 1) / SEG))
                fc.loops[2][uvl].uv = (u1, vt * (1 - i / SEG))
                fc.loops[3][uvl].uv = (u0, vt * (1 - i / SEG))
            prev = (a, b)
        if si == 0:
            chain_pts = [path(k / nb, 0, 0, 0, 1.0) for k in range(nb + 1)]
    if not chain_pts:
        chain_pts = [path(k / nb, 0, 0, 0, 1.0) for k in range(nb + 1)]
    PONY_CHAIN[0] = [path(0.12, 0, 0, 0, 1.0), path(0.25, 0, 0, 0, 1.0)]
    if pcfg.get("radial_normals"): print("PONY flipped", orient_faces(bm, PONY_N))
    bm.verts.index_update(); pn = [None] * len(bm.verts)
    for vv in bm.verts: pn[vv.index] = PONY_N.get(vv)
    mesh = bpy.data.meshes.new(NAME + "_ponytail")
    bm.to_mesh(mesh); bm.free()
    if pcfg.get("radial_normals") and NS:
        mesh.normals_split_custom_set_from_vertices([tuple(n) if n is not None else tuple(v.normal) for n, v in zip(pn, mesh.vertices)])
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
    if NS == 0:
        # bones only (keeps the skeleton identical); the hair asset itself carries the ponytail
        bpy.data.objects.remove(ob); bpy.data.meshes.remove(mesh)
        return None
    ob.parent = arm
    mod = ob.modifiers.new("Armature", 'ARMATURE'); mod.object = arm
    ob.data.materials.append(hair_card_material(pcfg))
    sel_only(ob); bpy.ops.object.shade_smooth()
    return ob

if "ponytail" in cfg:
    PONY_OB = make_ponytail(cfg["ponytail"])

def make_hairline(hc):
    """Soft hairline: short strand cards laid over the scalp border, combed back toward the ponytail tie."""
    from mathutils.bvhtree import BVHTree
    hair = [o for o in all_meshes() if o.name.endswith("_hair")][0]
    gi = body.vertex_groups["scalp"].index
    me_ = body.data; mw = body.matrix_world
    S = set(v.index for v in me_.vertices if any(g.group == gi and g.weight > 0.5 for g in v.groups))
    nb = {}
    for e in me_.edges:
        a_, b_ = e.vertices; nb.setdefault(a_, []).append(b_); nb.setdefault(b_, []).append(a_)
    head_h = world_bone_head("head")
    tie = PONY_TIE[0] if PONY_TIE[0] is not None else head_h + Vector((0, 0.12, 0.05))
    B = [i for i in S if any(j not in S for j in nb.get(i, []))]
    B = [mw @ me_.vertices[i].co for i in B]
    B = [c for c in B if c.y < head_h.y + hc.get("y_max", 0.05) and c.z > head_h.z + hc.get("z_min", 0.02)]
    # combined surface (skin + hair cap)
    verts = []; polys = []
    for o in (body, hair):
        m2 = o.matrix_world; off = len(verts)
        verts += [m2 @ v.co for v in o.data.vertices]; polys += [tuple(i + off for i in p.vertices) for p in o.data.polygons]
    bvh = BVHTree.FromPolygons(verts, polys)
    bm = bmesh.new(); uvl = bm.loops.layers.uv.new("UVMap"); dl = bm.verts.layers.deform.verify()
    SEG = hc.get("seg", 6); ncards = 0
    for c in B:
        for k in range(hc.get("per_vert", 2)):
            jit = Vector((random.uniform(-1, 1), random.uniform(-1, 1), random.uniform(-1, 1))) * 0.004
            p0 = c + jit
            # start slightly outside the hairline onto the skin
            d = (tie - p0); d.x *= hc.get("x_fac", 0.6); d.normalize()
            L = random.uniform(*hc.get("length", (0.05, 0.09)))
            start = p0 - d * random.uniform(0.0, hc.get("overhang", 0.006))
            wid = random.uniform(*hc.get("width", (0.006, 0.011)))
            prev = None; u0 = random.choice([0.0, 0.5]); u1 = u0 + 0.5
            pts = []
            for s_ in range(SEG + 1):
                t = s_ / SEG
                q = start + d * (L * t)
                loc, nrm, idx, dist = bvh.find_nearest(q)
                if loc is None: break
                pts.append((loc + nrm * (hc.get("lift", 0.0015) + hc.get("lift_end", 0.002) * t), nrm))
            if len(pts) < SEG + 1: continue
            for s_, (q, nrm) in enumerate(pts):
                t = s_ / SEG
                tang = (pts[min(s_ + 1, SEG)][0] - pts[max(s_ - 1, 0)][0]).normalized()
                side = nrm.cross(tang).normalized()
                w = wid * (0.6 + 0.4 * t)
                a_ = bm.verts.new(q - side * w); b_ = bm.verts.new(q + side * w)
                for vv in (a_, b_): vv[dl][0] = 1.0
                if prev:
                    f = bm.faces.new([prev[0], prev[1], b_, a_])
                    # v: tip (sparse) at the hairline, root (dense) toward the back
                    f.loops[0][uvl].uv = (u0, (s_ - 1) / SEG); f.loops[1][uvl].uv = (u1, (s_ - 1) / SEG)
                    f.loops[2][uvl].uv = (u1, s_ / SEG); f.loops[3][uvl].uv = (u0, s_ / SEG)
                prev = (a_, b_)
            ncards += 1
    mesh = bpy.data.meshes.new(NAME + "_hairline"); bm.to_mesh(mesh); bm.free()
    ob = bpy.data.objects.new(NAME + "_hairline", mesh); bpy.context.scene.collection.objects.link(ob)
    ob.vertex_groups.new(name="head")
    ob.parent = arm
    mod = ob.modifiers.new("Armature", 'ARMATURE'); mod.object = arm
    mat = PONY_OB.data.materials[0] if PONY_OB else hair_card_material(hc)
    ob.data.materials.append(mat)
    sel_only(ob); bpy.ops.object.shade_smooth()
    print("HAIRLINE cards", ncards, "verts", len(mesh.vertices))
    if PONY_OB:
        bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); PONY_OB.select_set(True)
        bpy.context.view_layer.objects.active = PONY_OB; bpy.ops.object.join()
    return ob

if "hairline" in cfg:
    make_hairline(cfg["hairline"])


def make_hair_shell(hs):
    """Hair cap built from strand cards combed back over the scalp toward the ponytail tie (replaces the MakeHuman
    helmet-like cap): layered cards with feathered tips at the hairline, a few flyaways, and an elastic at the tie."""
    from mathutils.bvhtree import BVHTree
    rng = random.Random(hs.get("seed", 5))
    gi = body.vertex_groups["scalp"].index
    me_ = body.data; mw = body.matrix_world
    S = set(v.index for v in me_.vertices if any(g.group == gi and g.weight > 0.5 for g in v.groups))
    nbr = {}
    for e in me_.edges:
        a_, b_ = e.vertices; nbr.setdefault(a_, []).append(b_); nbr.setdefault(b_, []).append(a_)
    ring = set(S)
    for _ in range(3): ring |= set(j for i in list(ring) for j in nbr.get(i, []))
    head_h = world_bone_head("head")
    tie = PONY_TIE[0] if PONY_TIE[0] is not None else head_h + Vector((0, 0.12, 0.05))
    W = [mw @ v.co for v in me_.vertices]
    polys = [tuple(p.vertices) for p in me_.polygons if all(i in ring for i in p.vertices)]
    bvh = BVHTree.FromPolygons(W, polys)
    scalp_faces = [p for p in me_.polygons if all(i in S for i in p.vertices)]
    areas = [p.area for p in scalp_faces]; tot = sum(areas)
    def rand_on_face(p):
        vs = [W[i] for i in p.vertices]; a_, b_ = rng.random(), rng.random()
        if a_ + b_ > 1: a_, b_ = 1 - a_, 1 - b_
        k = rng.randrange(1, len(vs) - 1)
        return vs[0] + (vs[k] - vs[0]) * a_ + (vs[k + 1] - vs[0]) * b_
    roots = []   # (point, kind)
    for p in rng.choices(scalp_faces, weights=areas, k=hs.get("n_main", 300)):
        roots.append((rand_on_face(p), "main"))
    bidx = [i for i in S if any(j not in S for j in nbr.get(i, []))]
    for k in range(hs.get("n_inner", 0)):
        # long strands rooted just inside the hairline, running all the way to the tie (slicked-back look)
        i = rng.choice(bidx); c = W[i]
        loc, nrm, _, _ = bvh.find_nearest(c); d = tie - loc; d -= nrm * d.dot(nrm); d.normalize()
        roots.append((loc + d * rng.uniform(0.0, hs.get("inner_depth", 0.015)), "inner"))
    border = [W[i] for i in S if any(j not in S for j in nbr.get(i, []))]
    for c in border:
        for k in range(hs.get("per_border", 3)):
            jit = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-1, 1))) * 0.004
            roots.append((c + jit, "fly" if rng.random() < hs.get("fly", 0.1) else "border"))
    bm = bmesh.new(); uvl = bm.loops.layers.uv.new("UVMap"); dl = bm.verts.layers.deform.verify()
    step = hs.get("step", 0.012); ncards = 0; SHELL_N = {}
    for p0, kind in roots:
        layer = rng.randrange(hs.get("layers", 3)) if kind in ("main", "inner") else rng.choice([0, 1])
        lift0 = hs.get("lift", 0.0025) + layer * hs.get("layer_gap", 0.0022)
        maxlen = rng.uniform(*hs.get("length", (0.08, 0.22)))
        wid = rng.uniform(*hs.get("width", (0.006, 0.012)))
        if kind == "fly": wid *= 0.45; maxlen *= rng.uniform(0.4, 0.8)
        if kind == "inner" or (kind == "border" and hs.get("border_long")): maxlen = 0.4
        a0 = rng.uniform(-0.15, 0.15); a1 = rng.uniform(0.0, 0.25); ph = rng.uniform(0, 6.28)
        fly_h = rng.uniform(0.002, 0.006) if kind == "fly" else 0.0
        # start slightly onto the skin at the hairline (overhang), tip end there
        p = p0; pts = []; s = 0.0
        loc, nrm, _, _ = bvh.find_nearest(p)
        d = tie - loc; d -= nrm * d.dot(nrm); d.x *= hs.get("x_fac", 0.85)
        if kind != "main": p = loc - d.normalized() * rng.uniform(0.0, hs.get("overhang", 0.005))
        while s <= maxlen:
            loc, nrm, _, _ = bvh.find_nearest(p)
            if loc is None: break
            d = tie - loc; dist = d.length; d -= nrm * d.dot(nrm); d.x *= hs.get("x_fac", 0.85)
            if d.length < 1e-6: break
            d.normalize()
            ang = a0 + a1 * math.sin(s * 40 + ph)
            d = (Quaternion(nrm, ang) @ d).normalized()
            t = s / maxlen
            h = lift0 + hs.get("lift_grow", 0.004) * t + fly_h * math.sin(min(1.0, t * 1.4) * math.pi) 
            pts.append((loc + nrm * h, nrm))
            if dist < hs.get("stop", 0.02): break
            st = step * (hs.get("inner_step", 1.0) if kind in ("inner", "border") else 1.0)
            p = loc + d * st; s += st
        if len(pts) < 3: continue
        n = len(pts) - 1
        prev = None; u0 = 0.5 if kind == "fly" or rng.random() < 0.35 else 0.0; u1 = u0 + 0.5
        vstart = rng.uniform(0.0, 0.06) if kind != "main" else rng.uniform(*hs.get("vstart_main", (0.0, 0.15)))
        for k, (q, nrm) in enumerate(pts):
            t = k / n
            tang = (pts[min(k + 1, n)][0] - pts[max(k - 1, 0)][0]).normalized()
            side = nrm.cross(tang).normalized()
            w = wid * (0.55 + 0.45 * t)
            a_ = bm.verts.new(q - side * w); b_ = bm.verts.new(q + side * w)
            for vv in (a_, b_): vv[dl][0] = 1.0; SHELL_N[vv] = nrm.copy()
            v = vstart + (1.0 - vstart) * t
            if prev:
                f = bm.faces.new([prev[0], prev[1], b_, a_])
                f.loops[0][uvl].uv = (u0, prev[2]); f.loops[1][uvl].uv = (u1, prev[2])
                f.loops[2][uvl].uv = (u1, v); f.loops[3][uvl].uv = (u0, v)
            prev = (a_, b_, min(v, 0.97))
        ncards += 1
    # elastic band around the tie
    if hs.get("band", True) and PONY_OB is not None:
        axis = (Vector(hs.get("band_axis", (0, 0.6, -0.8)))).normalized()
        if hs.get("band_follow") and PONY_CHAIN[0]: axis = (PONY_CHAIN[0][1] - PONY_CHAIN[0][0]).normalized()
        R = hs.get("band_r", 0.016); r = hs.get("band_thick", 0.004)
        c0 = tie + axis * hs.get("band_off", 0.012)
        ax1 = axis.cross(Vector((1, 0, 0))).normalized(); ax2 = axis.cross(ax1).normalized()
        NU, NV = 16, 6; grid = []
        for i in range(NU):
            th = 2 * math.pi * i / NU; ctr = c0 + (ax1 * math.cos(th) + ax2 * math.sin(th)) * R
            rad = (ctr - c0).normalized(); row = []
            for j in range(NV):
                ph_ = 2 * math.pi * j / NV
                vv = bm.verts.new(ctr + (rad * math.cos(ph_) + axis * math.sin(ph_)) * r); vv[dl][0] = 1.0; row.append(vv)
            grid.append(row)
        for i in range(NU):
            for j in range(NV):
                f = bm.faces.new([grid[i][j], grid[(i + 1) % NU][j], grid[(i + 1) % NU][(j + 1) % NV], grid[i][(j + 1) % NV]])
                for l in f.loops: l[uvl].uv = (0.25, 0.995)
    print("SHELL flipped", orient_faces(bm, SHELL_N))
    bm.verts.index_update(); nlist = [None] * len(bm.verts)
    for vv in bm.verts: nlist[vv.index] = SHELL_N.get(vv)
    mesh = bpy.data.meshes.new(NAME + "_hairshell"); bm.to_mesh(mesh); bm.free()
    if hs.get("scalp_normals", True):
        nl = [tuple(n) if n is not None else tuple(v.normal) for n, v in zip(nlist, mesh.vertices)]
        mesh.normals_split_custom_set_from_vertices(nl)
    ob = bpy.data.objects.new(NAME + "_hairshell", mesh); bpy.context.scene.collection.objects.link(ob)
    ob.vertex_groups.new(name="head"); ob.parent = arm
    mod = ob.modifiers.new("Armature", 'ARMATURE'); mod.object = arm
    ob.data.materials.append(PONY_OB.data.materials[0] if PONY_OB else hair_card_material(hs))
    sel_only(ob); bpy.ops.object.shade_smooth()
    print("HAIRSHELL cards", ncards, "verts", len(mesh.vertices))
    if hs.get("remove_cap", True):
        for o in [o for o in all_meshes() if o.name.endswith("_hair")]:
            print("REMOVED CAP", o.name); bpy.data.objects.remove(o)
    if PONY_OB:
        bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); PONY_OB.select_set(True)
        bpy.context.view_layer.objects.active = PONY_OB; bpy.ops.object.join()
    return ob

if "hair_shell" in cfg:
    make_hair_shell(cfg["hair_shell"])


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
# tuck skin that is fully covered by clothing a few mm inwards (prevents poke-through, keeps topology/UVs)
tuck = cfg.get("tuck", {})
if tuck:
    kbs = me.shape_keys.key_blocks if me.shape_keys else []
    nmv = 0
    for i, c in enumerate(zc):
        d = max([tuck.get(k, 0.0) for k in chan if c[chan[k]] > 0.5] or [0.0])
        if d <= 0: continue
        nv_ = me.vertices[i].normal * d
        me.vertices[i].co -= nv_
        for kb in kbs: kb.data[i].co -= nv_
        nmv += 1
    # optional soft ring just outside a zone (skin under sleeve/hem edges that the zone mask keeps visible)
    nbr_ = {}
    for e in me.edges:
        a_, b_ = e.vertices; nbr_.setdefault(a_, []).append(b_); nbr_.setdefault(b_, []).append(a_)
    for k, (rings, depth) in cfg.get("tuck_ring", {}).items():
        front = set(i for i, c in enumerate(zc) if c[chan[k]] > 0.5); seen = set(front)
        for r in range(1, rings + 1):
            front = set(j for i in front for j in nbr_.get(i, []) if j not in seen); seen |= front
            d = depth * (1 - r / (rings + 1))
            for i in front:
                nv_ = me.vertices[i].normal * d
                me.vertices[i].co -= nv_
                for kb in kbs: kb.data[i].co -= nv_
                nmv += 1
    tc = cfg.get("tuck_cover")
    if tc:
        # skin covered by a garment with no delete group: ray along the skin normal hits the garment -> tuck inward
        from mathutils.bvhtree import BVHTree
        gar = [o for o in all_meshes() if o.name.endswith(tc["obj"])][0]
        dg = bpy.context.evaluated_depsgraph_get()
        gbvh = BVHTree.FromObject(gar, dg)
        gi_ = gar.matrix_world.inverted(); bmw = body.matrix_world
        ncov = 0
        for v in me.vertices:
            if any(zc[v.index][ch_] > 0.5 for ch_ in range(3)): continue
            o_ = gi_ @ (bmw @ v.co); dvec = (gi_.to_3x3() @ (bmw.to_3x3() @ v.normal)).normalized()
            hit = gbvh.ray_cast(o_ - dvec * 0.002, dvec, tc.get("max_dist", 0.03))
            if hit[0] is None: continue
            # also require coverage a bit around (keeps skin right at hems/collar untouched)
            ok = True
            for off in tc.get("probe", []):
                q = o_ + Vector(off)
                if gbvh.ray_cast(q - dvec * 0.002, dvec, tc.get("max_dist", 0.03))[0] is None: ok = False; break
            if not ok: continue
            nv_ = v.normal * tc.get("depth", 0.005)
            v.co -= nv_
            for kb in kbs: kb.data[v.index].co -= nv_
            ncov += 1
        print("TUCK_COVER", gar.name, ncov)
    print("TUCKED", nmv, "verts")
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

# ---------- 9b. lock skeleton to a reference rig (keeps animation/contact data valid) ----------
from mathutils import Quaternion
if cfg.get("lock_rig"):
    R = json.load(open(cfg["lock_rig"]))
    if cfg.get("lock_rig_fit", True):
        # 1) pose the freshly fitted rig onto the reference rest skeleton, 2) bake that deformation into the
        #    meshes (incl. shape keys), so the mesh fits the reference joints instead of just moving pivots.
        bpy.context.view_layer.objects.active = arm
        for pb in arm.pose.bones: pb.rotation_mode = 'QUATERNION'
        order = []
        pend = [b_ for b_ in arm.pose.bones]
        while pend:
            for pb in list(pend):
                if pb.parent is None or pb.parent in order: order.append(pb); pend.remove(pb)
        for pb in order:
            if pb.name not in R: continue
            M = Quaternion(R[pb.name]["rest_q"]).to_matrix().to_4x4(); M.translation = Vector(R[pb.name]["head"])
            pb.matrix = M
            bpy.context.view_layer.update()
        dg = bpy.context.evaluated_depsgraph_get()
        for o in arm.children:
            if o.type != 'MESH' or not any(md.type == 'ARMATURE' for md in o.modifiers): continue
            e = o.evaluated_get(dg); em = e.to_mesh()
            if len(em.vertices) != len(o.data.vertices): e.to_mesh_clear(); print("FIT skip", o.name); continue
            disp = [em.vertices[i].co - o.data.vertices[i].co for i in range(len(em.vertices))]
            e.to_mesh_clear()
            for i, dv in enumerate(disp): o.data.vertices[i].co += dv
            if o.data.shape_keys:
                for kb in o.data.shape_keys.key_blocks:
                    for i, dv in enumerate(disp): kb.data[i].co += dv
            print("FIT", o.name, "max disp %.4f" % max(dv.length for dv in disp))
        for pb in arm.pose.bones:
            pb.location = (0, 0, 0); pb.rotation_quaternion = (1, 0, 0, 0); pb.scale = (1, 1, 1)
        bpy.context.view_layer.update()
    sel_only(arm)
    bpy.ops.object.mode_set(mode='EDIT')
    ebs = arm.data.edit_bones
    conn = {e.name: e.use_connect for e in ebs}
    for e in ebs: e.use_connect = False
    dev = []
    for name, b in R.items():
        e = ebs.get(name)
        if e is None: print("RIGLOCK missing bone", name); continue
        dev.append(((e.head - Vector(b["head"])).length, name))
        M = Quaternion(b["rest_q"]).to_matrix().to_4x4(); M.translation = Vector(b["head"])
        e.matrix = M; e.length = (Vector(b["tail"]) - Vector(b["head"])).length
    extra = [e.name for e in ebs if e.name not in R]
    for e in ebs: e.use_connect = conn[e.name]
    bpy.ops.object.mode_set(mode='OBJECT')
    dev.sort(reverse=True)
    print("RIGLOCK top:", [(n, round(d_, 3)) for d_, n in dev[:12]])
    print("RIGLOCK", cfg["lock_rig"], "max joint shift %.4f m (%s), mean %.4f" % (dev[0][0], dev[0][1], sum(d for d, _ in dev) / len(dev)), "extra bones:", extra)

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

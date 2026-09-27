import bpy, sys, json, importlib, os
argv = sys.argv[sys.argv.index("--")+1:]
cfg = json.load(open(argv[0]))
P = "bl_ext.user_default.mpfb.services."
HS = importlib.import_module(P+"humanservice").HumanService
AS = importlib.import_module(P+"assetservice").AssetService

# clean scene
bpy.ops.wm.read_factory_settings(use_empty=True)

info = HS._create_default_human_info_dict()
info["name"] = cfg["name"]
info["phenotype"].update(cfg["phenotype"])
info["targets"] = [{"target": k, "value": v} for k, v in cfg.get("targets", {}).items()]
info["rig"] = cfg.get("rig", "game_engine")
for bp in ["eyes","eyebrows","eyelashes","teeth","tongue","hair"]:
    if bp in cfg: info[bp] = cfg[bp]
info["clothes"] = cfg.get("clothes", [])
info["skin_mhmat"] = cfg.get("skin", "")
info["skin_material_type"] = "MAKESKIN"
info["eyes_material_type"] = "MAKESKIN"
settings = HS.get_default_deserialization_settings()
settings["subdiv_levels"] = 0
settings["detailed_helpers"] = False
settings["extra_vertex_groups"] = False
body = HS.deserialize_from_dict(info, settings)
print("BODY", body.name)
for o in bpy.data.objects:
    print("OBJ", o.name, o.type, len(o.data.vertices) if o.type=='MESH' else '', [m.type for m in o.modifiers] if o.type=='MESH' else '')
bpy.ops.wm.save_as_mainfile(filepath=cfg["out_blend"])

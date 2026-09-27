import json, sys
KP = json.load(open('/workspace/bb3d/anim/strike_params.json'))
def kick_jobs(frames=None, zmin=0.25):
    K = KP["kick"]; cf = K["contact_f"]; J = []
    for f in (frames or range(0, K["end_f"] + 1)):
        J.append({"tag": f"kick f{f}", "rus": "rus_kick_up", "rf": f, "guy": "guy_idle" if f < cf else "guy_flinch", "gf": f if f < cf else f - cf, "guy_m": K["guy_m"], "zmin": zmin})
    return J
def knee_jobs(frames=None, zmin=0.0):
    N = KP["knee"]; cf = N["contact_f"]; J = []
    for f in (frames or range(0, N["end_f"] + 1)):
        if f < cf: guy, gf = "guy_clinched", f
        elif f < cf + 12: guy, gf = "guy_flinch_knee", f - cf
        else: guy, gf = "guy_double_over", f - cf - 12
        J.append({"tag": f"knee f{f}", "rus": "rus_knee", "rf": f, "guy": guy, "gf": gf, "guy_m": N["guy_m"], "zmin": zmin})
    return J
if __name__ == "__main__":
    which = sys.argv[1]; out = sys.argv[2]
    J = kick_jobs() if which == "kick" else knee_jobs() if which == "knee" else kick_jobs() + knee_jobs()
    json.dump({"jobs": J, "out": out + ".res.json"}, open(out, "w"))

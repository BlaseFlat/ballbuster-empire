import numpy as np, math, copy
from qmath import *
from poses import Pose, solve
from rig import Rig

GUY_M = -0.74        # guy origin Y in Rusana space (guy rotated 180°)
def g2w(p): return np.array([-p[0], GUY_M - p[1], p[2]])
def w2g(p): return np.array([-p[0], GUY_M - p[1], p[2]])

class Clip:
    def __init__(self, name, loop=False, fps=30): self.name=name; self.loop=loop; self.fps=fps; self.k=[]
    def key(self, f, pose): self.k.append((f, pose)); return self

FIST = {"l": (0.95, 0.8), "r": (0.95, 0.8)}
OPEN = {"l": (0.35, 0.3), "r": (0.35, 0.3)}
GRIP = {"l": (0.65, 0.5), "r": (0.65, 0.5)}

# ================= RUSANA =================
def rus_stance():
    return Pose(
      spine={"pelvis": (-4,0,6), "spine_01": (4,0,-2), "spine_02": (4,0,-3), "spine_03": (3,0,-2), "neck_01": (-3,0,1), "head": (-3,0,4)},
      root=(0,0,-0.055),
      feet={"l": {"ball": [0.12,-0.20,0.012], "pitch": -4, "yaw": 10, "pole": (0.25,-1,0.1)},
            "r": {"ball": [-0.12,0.10,0.012], "pitch": -10, "yaw": -18, "pole": (-0.3,-1,0.1)}},
      hands={"l": {"target": [0.10,-0.27,1.27], "pole": (0.5,0.3,-1), "twist": -30, "wrist": (0,0,-10)},
             "r": {"target": [-0.07,-0.22,1.22], "pole": (-0.5,0.3,-1), "twist": 30, "wrist": (0,0,10)}},
      fingers=FIST, shape={"cold": 0.8})

def guard(dy=0.0, dz=0.0):
    return {"l": {"target": [0.12,-0.25+dy,1.24+dz], "pole": (0.6,0.3,-1), "twist": -30},
            "r": {"target": [-0.08,-0.20+dy,1.18+dz], "pole": (-0.6,0.3,-1), "twist": 30}}

# guy-local contact targets (guy idle stance), converted
KICK_C   = g2w((0.0, -0.04, 0.79))    # instep meets underside of groin (mesh-verified)
KICK_PK  = g2w((0.0, -0.02, 0.80))    # driven up with him (he is lifted onto his toes, guy-local)
KICK_FT  = g2w((0.0, -0.18, 0.80))    # follow-through: up & out in front as he folds back
KICK_AP  = g2w((0.0, -0.20, 0.70))    # approach from below, centerline
KNEE_C   = g2w((0.0, -0.05, 0.84))    # kneecap meets groin from below (mesh-verified 0-4 mm)
KNEE_PK  = g2w((0.0, -0.05, 0.86))

def build_rusana(rigpath):
    R = Rig(rigpath); C = []
    st = rus_stance()
    c = Clip("rus_idle", loop=True)
    c.key(0, st)
    c.key(22, st.copy(spine={"spine_02": (6,0,-3), "spine_01": (5,0,-2), "head": (-2,0,4)}, root=(0,0,-0.066), hands=guard(0.01,-0.012)))
    c.key(44, st.copy(spine={"spine_03": (2,0,-1), "head": (-4,0,2)}, root=(0,0,-0.05), hands=guard(0,0.005)))
    c.key(64, st)
    C.append((c))

    c = Clip("rus_walk", loop=True)
    N = 32
    def wp(ph):
        a = ph * 2 * math.pi
        sw = math.sin(a)
        def foot(side, phase):
            # phase 0..1: 0-0.6 stance (moving back), 0.6-1 swing (moving fwd, lifted)
            p = (ph + phase) % 1.0
            if p < 0.6:
                t = p / 0.6; y = -0.25 + 0.50 * t; z = 0.0; pitch = -2 + (-18 * max(0, (t - 0.75) / 0.25))
            else:
                t = (p - 0.6) / 0.4; y = 0.25 - 0.50 * (0.5 - 0.5 * math.cos(t * math.pi)); z = 0.09 * math.sin(t * math.pi); pitch = -20 * (1 - t) + 6 * t
            x = 0.085 if side == "l" else -0.085
            return {"ankle": [x, y, 0.066 + z], "pitch": pitch, "yaw": (5 if side == "l" else -5), "pole": ((0.2 if side == "l" else -0.2), -1, 0.1)}
        bob = -0.035 - 0.022 * abs(math.cos(a))
        return Pose(
          spine={"pelvis": (-3, 0, 5 * sw), "spine_01": (3, 2 * sw, 0), "spine_02": (3, 0, -3 * sw), "spine_03": (2, 0, -4 * sw), "neck_01": (-2, 0, 3 * sw), "head": (-1, 0, 4 * sw)},
          root=(0.012 * sw, 0, bob),
          feet={"l": foot("l", 0.0), "r": foot("r", 0.5)},
          hands={"l": {"target": [0.21, 0.02 + 0.13 * sw, 0.82], "pole": (0.4, 1, 0.2), "twist": -10},
                 "r": {"target": [-0.21, 0.02 - 0.13 * sw, 0.82], "pole": (-0.4, 1, 0.2), "twist": 10}},
          fingers=OPEN, shape={"cold": 0.35})
    for i in range(9): c.key(int(i * N / 8), wp(i / 8))
    C.append(c)

    # ================= v2 strikes (expert review) — parametric, mesh-fitted, see strikes.py / blender/fitlab.py =================
    import strikes as ST, json as _json, os as _os2
    KP = _json.load(open(_os2.path.join(_os2.path.dirname(__file__), "strike_params.json")))
    # ---------- rus_kick_up : starts from stance at 0.64 m; contact f8 (0.267 s), hold f9, back down arc f9-f13, recover ----------
    c = Clip("rus_kick_up")
    K = KP["kick"]
    c.key(0, st.copy(guy="idle", shape={"cold": 0.7}))
    for fs, d in sorted(K["keys"].items(), key=lambda x: int(x[0])):
        f = int(fs); q = dict(d); shp = q.pop("shape", {"effort": 1.0})
        P = ST.kick_pose(**q); P.shape = shp; P.guy = "flinch" if f >= K["contact_f"] else "idle"
        c.key(f, P)
    c.key(K["end_f"], st.copy(shape={"cold": 0.6, "smirk": 0.3}, guy="flinch"))
    C.append(c)

    # ---------- rus_knee : clinch at 0.33 m; contact f12 (0.40 s), drive up to f15, drop ----------
    c = Clip("rus_knee")
    N = KP["knee"]; gm = N["guy_m"]
    # her hands track his neck (guy: clinched until contact, then flinch_knee, then double_over)
    import author2 as _A2
    Rg_, gcl = build_guy(rigpath.replace("rusana_rig", "guy_rig"))
    gfr = {cc.name: _A2.run(Rg_, cc)[0] for cc in gcl if cc.name in ("guy_clinched", "guy_flinch_knee", "guy_double_over")}
    cf = N["contact_f"]
    def neck_w(f):
        if f < cf: nm, ff = "guy_clinched", f
        elif f < cf + 12: nm, ff = "guy_flinch_knee", f - cf
        else: nm, ff = "guy_double_over", f - cf - 12
        fr = gfr[nm][max(0, min(ff, len(gfr[nm]) - 1))]
        D_, H_ = Rg_.fk(fr[0], fr[1]); p = H_["neck_01"]
        return np.array([-p[0], gm - p[1], p[2]])
    dys = {int(k): v.get("dy", 0.0) for k, v in N["keys"].items()}; dys[0] = 0.0; dys[N["end_f"]] = 0.0
    def dy_of(f):
        ks = sorted(dys)
        for i in range(len(ks) - 1):
            if ks[i] <= f <= ks[i+1]:
                t = (f - ks[i]) / (ks[i+1] - ks[i]); return dys[ks[i]] * (1 - t) + dys[ks[i+1]] * t
        return dys[ks[-1]]
    ho = [float(v) for v in _os2.environ.get("KNEE_HO", ",".join(map(str, N["hand_off"]))).split(",")]
    ARC = [float(v) for v in _os2.environ.get("KNEE_ARC", "0.34,0.10,0.10").split(",")]
    KPOLE = [float(v) for v in _os2.environ.get("KNEE_POLE", ",".join(map(str, N.get("hand_pole", [2.0,0.0,3.0,10,0.4])))).split(",")]
    KW = [float(v) for v in _os2.environ.get("KNEE_WRIST", ",".join(map(str, N.get("hand_wrist", [0, 0, 0])))).split(",")]
    def track(f, grip=1.0, hz_extra=0.0):
        """grip 1 = hands locked behind his neck; 0 = her guard; in-between arcs up & around his shoulders."""
        nk = neck_w(f)
        hl = nk + np.array([ho[0], -ho[1], ho[2] + hz_extra]); hr = nk + np.array([-ho[0], -ho[1], ho[2] + hz_extra])
        G = guard(-0.02); H = {}
        arc = math.sin(math.pi * grip)
        for s_, tgt, sg in (("l", hl, 1), ("r", hr, -1)):
            gt = np.array(G[s_]["target"]) + np.array([0, dy_of(f), 0])
            t = tgt * grip + gt * (1 - grip) + np.array([ARC[0] * sg * arc, ARC[1] * arc, ARC[2] * arc])
            H[s_] = {"target": list(t), "pole": (KPOLE[0] * sg, KPOLE[1], KPOLE[2]) if grip > 0.3 else G[s_]["pole"], "twist": (-KPOLE[3] * sg) if grip > 0.3 else G[s_]["twist"]}
            if grip > 0.3: H[s_]["wrist"] = (KW[0] * grip, KW[1] * sg * grip, KW[2] * sg * grip)
        return H
    st0 = rus_stance()
    LF0 = list(st0.feet["l"]["ball"]); RF0 = list(st0.feet["r"]["ball"])
    c.key(0, st0.copy(guy="clinched", shape={"cold": 0.8}))
    for fs, d in sorted(N["keys"].items(), key=lambda x: int(x[0])):
        f = int(fs); q = dict(d); shp = q.pop("shape", {"effort": 1.0})
        step = q.pop("step", None); grip = q.pop("grip", 1.0); dy = q.get("dy", 0.0); hz_extra = q.pop("hz_extra", 0.0)
        P = ST.knee_pose(**{**q, "gm": gm, "sup_y": N["sup_y"] + N["keys"]["12"]["dy"]})
        if step:
            P.leg3 = {}
            lf_new = [0.10, N["sup_y"] + N["keys"]["12"]["dy"], 0.012]
            if step == "l_mid":        # left foot mid-step forward, right planted in stance
                P.feet["l"] = {"ball": [0.11, (LF0[1] + lf_new[1]) / 2, 0.07], "pitch": -20, "yaw": 8, "pole": (0.25,-1,0.2)}
                P.feet["r"] = dict(st0.feet["r"]); P.feet["r"]["pitch"] = 8
            elif step == "r_back":     # right foot planted back at stance spot, left still forward
                P.feet["l"] = {"ball": lf_new, "pitch": -4, "yaw": 8, "pole": (0.25,-1,0.1)}
                P.feet["r"] = dict(st0.feet["r"])
            elif step == "l_back_mid": # left foot stepping back to stance
                P.feet["l"] = {"ball": [0.115, (LF0[1] + lf_new[1]) / 2 + 0.03, 0.05], "pitch": -10, "yaw": 9, "pole": (0.25,-1,0.2)}
                P.feet["r"] = dict(st0.feet["r"])
        P.hands = track(f, grip, hz_extra)
        P.fing = {"l": (KPOLE[4], 0.4), "r": (KPOLE[4], 0.4)} if grip > 0.5 else (OPEN if f < cf else FIST)
        P.shape = shp; P.guy = "flinch_knee" if f >= cf else "clinched"
        c.key(f, P)
    c.key(N["end_f"], st0.copy(shape={"smirk": 0.5, "cold": 0.4}, guy="double_over"))
    C.append(c)

    # ---------- rus_victory (8 keys) ----------
    c = Clip("rus_victory")
    hips = {"l": {"target": [0.19,0.03,0.90], "pole": (1,0.6,0), "twist": -60, "wrist": (0,0,-35)},
            "r": {"target": [-0.19,0.03,0.90], "pole": (-1,0.6,0), "twist": 60, "wrist": (0,0,35)}}
    def stand(head, pel_z=4, shape=None):
        return Pose(spine={"pelvis": (-3,0,pel_z), "spine_01": (-3,0,0), "spine_02": (-4,0,0), "spine_03": (-3,0,0), "neck_01": (5,0,0), "head": head},
            root=(0.015 if pel_z > 4 else -0.01,0,-0.025),
            feet={"l": {"ball": [0.13,-0.12,0.012], "pitch": -4, "yaw": 14, "pole": (0.3,-1,0)},
                  "r": {"ball": [-0.11,-0.08,0.012], "pitch": -4, "yaw": -16, "pole": (-0.3,-1,0)}},
            hands=hips, fingers=OPEN, shape=shape or {"smirk": 1.0})
    c.key(0, st.copy(guy="floor"))
    c.key(10, st.copy(spine={"head": (4,0,3)}, shape={"smirk": 0.5}, guy="floor"))
    c.key(20, stand((8,0,2), shape={"smirk": 0.8}).copy(guy="tap"))
    c.key(32, stand((12,-8,2), pel_z=8).copy(guy="tap"))
    c.key(46, stand((10,6,2), pel_z=0).copy(guy="tap"))
    c.key(58, stand((14,0,4)).copy(guy="tap"))
    c.key(70, stand((12,0,3)).copy(guy="tap"))
    c.key(84, stand((12,0,3)).copy(guy="tap"))
    C.append(c)
    return R, C

# ================= GUY (guy-local space; faces -Y) =================
import os as _os
G_ROOTZ = float(_os.environ.get("G_ROOTZ", "-0.065"))
G_FX = float(_os.environ.get("G_FX", "0.29"))
G_FEET = {"l": {"ball": [G_FX,-0.12,0.012], "pitch": -3, "yaw": 18, "pole": (0.45,-1,0)},
          "r": {"ball": [-G_FX,-0.10,0.012], "pitch": -3, "yaw": -18, "pole": (-0.45,-1,0)}}
def g_idle():
    return Pose(spine={"pelvis": (-2,0,0), "spine_01": (1,0,0), "spine_02": (2,0,0), "spine_03": (1,0,0), "neck_01": (-3,0,0), "head": (-4,0,0)},
        root=(0,0,G_ROOTZ), feet=copy.deepcopy(G_FEET),
        hands={"l": {"target": [0.25,-0.02,0.88], "pole": (0.5,1,0), "twist": -10}, "r": {"target": [-0.25,-0.02,0.88], "pole": (-0.5,1,0), "twist": 10}},
        fingers={"l": (0.4,0.3), "r": (0.4,0.3)}, shape={"smug": 0.6})

def groin_hands(z=0.86, y=-0.15, spread=0.05):
    return {"l": {"target": [spread, y, z], "pole": (1,0.6,-0.3), "twist": -50, "wrist": (0,0,-20)},
            "r": {"target": [-spread, y, z], "pole": (-1,0.6,-0.3), "twist": 50, "wrist": (0,0,20)}}

def knees_in(feet, amt):
    f = copy.deepcopy(feet)
    f["l"]["pole"] = (-0.6*amt + 0.35*(1-amt), -1, 0); f["r"]["pole"] = (0.6*amt - 0.35*(1-amt), -1, 0)
    return f

def build_guy(rigpath):
    R = Rig(rigpath); C = []
    gi = g_idle()
    c = Clip("guy_idle", loop=True)
    c.key(0, gi)
    c.key(26, gi.copy(spine={"spine_02": (3.5,0,0), "head": (-3,2,0)}, root=(0,0,G_ROOTZ-0.006)))
    c.key(52, gi)
    C.append(c)

    # ---- reaction timing (guy clip time 0 == strike contact frame; engine hit-stop freezes both mixers ~0.06 s first) ----
    # flinch  f0-f6 (0.00-0.20 s): pelvis snaps back 7 cm, knees cave in, hands drop to groin
    #         f6-f12 (0.20-0.40 s): frozen beat, breath knocked out, mouth open -> ends exactly on double_over f0
    def flinch_end(tremble=0.0, up=0.0):
        return Pose(spine={"pelvis": (9-3*up,0,0), "spine_01": (10+tremble-5*up,0,0), "spine_02": (12-6*up,0,0), "spine_03": (8-5*up,0,0), "neck_01": (-2+4*up,0,0), "head": (-3+2*up,0,0)},
            root=(0,0.085,G_ROOTZ-0.035), feet=knees_in(G_FEET, 1.0), hands=groin_hands(0.80, -0.13, 0.06), fingers=GRIP, shape={"shock": 0.85, "pain": 0.7})
    def flinch_seq(c, start, toes=0.0, hand_delay=0):
        """start = pose at contact. toes = heel-rise (m) for the knee-strike variant."""
        def lifted(amt, tt=1.0):
            if hand_delay: amt = {0.45: -0.3, 0.85: -0.05, 1.0: 0.55}.get(amt, amt)   # her knee is between his thighs: cave in only after it drops
            f = knees_in(G_FEET, amt)
            if toes > 0:   # +pitch lifts heels (balls planted); ankle->ball 0.147, rest 26.7 deg
                for s_ in ("l", "r"): f[s_]["pitch"] = -3 + (math.degrees(math.asin(min(0.99, (0.066 + toes * tt) / 0.147))) - 26.7)
            return f
        c.key(0, start.copy(shape={"shock": 0.6}))
        c.key(1, start.copy(shape={"shock": 0.8}))   # contact hold frame (matches her 1-frame hold); body snap starts f1->f2
        side_hands = {"l": {"target": [0.26,-0.05,0.90], "pole": (0.7,1,-0.2), "twist": -15}, "r": {"target": [-0.26,-0.05,0.90], "pole": (-0.7,1,-0.2), "twist": 15}}
        hn = (0, 0) if hand_delay else (-6, -8)     # head held in her clinch: no snap-back
        c.key(2, Pose(spine={"pelvis": (-3,0,0), "spine_01": (4,0,0), "spine_02": (4,0,0), "spine_03": (2,0,0), "neck_01": (hn[0],0,0), "head": (hn[1],0,0)},
            root=(0,0.035,G_ROOTZ-0.006+toes), feet=lifted(0.45),
            hands={"l": {"target": [0.21,-0.09,0.87], "pole": (0.7,1,-0.2), "twist": -25}, "r": {"target": [-0.21,-0.09,0.87], "pole": (-0.7,1,-0.2), "twist": 25}},
            fingers=OPEN, shape={"shock": 1.0}))
        c.key(4, Pose(spine={"pelvis": (5,0,0), "spine_01": (8,0,0), "spine_02": (9,0,0), "spine_03": (6,0,0), "neck_01": (0,0,0), "head": (2,0,0)},
            root=(0,0.065,G_ROOTZ-0.014+toes), feet=lifted(0.85),
            hands=side_hands if hand_delay else {"l": {"target": [0.12,-0.15,0.83], "pole": (0.9,0.8,-0.3), "twist": -40}, "r": {"target": [-0.12,-0.15,0.83], "pole": (-0.9,0.8,-0.3), "twist": 40}},
            fingers=OPEN, shape={"shock": 1.0, "pain": 0.3}))
        u = 1.0 if hand_delay else 0.0
        c.key(6, flinch_end(0, u).copy(root=(0,0.072,G_ROOTZ-0.03+toes*0.5), feet=lifted(1.0, 0.5) if toes else knees_in(G_FEET,1.0), shape={"shock": 1.0, "pain": 0.45}))
        c.key(9, flinch_end(0.6, u*0.8).copy(shape={"shock": 1.0, "pain": 0.55}))
        c.key(12, flinch_end())
    c = Clip("guy_flinch"); flinch_seq(c, gi); C.append(c)
    c = Clip("guy_stun", loop=True)   # optional: extend the frozen beat (breath knocked out)
    c.key(0, flinch_end()); c.key(8, flinch_end(0.8).copy(shape={"shock": 1.0, "pain": 0.6})); c.key(16, flinch_end())
    C.append(c)
    # clinched: she grabs his neck and pulls him down 2.5 cm (plays from rus_knee start; pull on f3-f9, holds)
    def clinched_pose(t):
        # pulled down by the neck: upper body folds forward so shoulders/head drop ~2.5-3 cm; pelvis almost unchanged (groin stays ~0.79)
        return Pose(spine={"pelvis": (-2+1*t,0,0), "spine_01": (1+2*t,0,0), "spine_02": (2+4*t,0,0), "spine_03": (1+5*t,0,0), "neck_01": (-3+10*t,0,0), "head": (-4+8*t,0,0)},
            root=(0,0.01*t,G_ROOTZ-0.004*t), feet=knees_in(G_FEET, -0.4*t),   # her knee wedges his thighs apart slightly
            hands={"l": {"target": [0.24,-0.03-0.07*t,0.88+0.06*t], "pole": (0.5,1,0), "twist": -10}, "r": {"target": [-0.24,-0.03-0.07*t,0.88+0.06*t], "pole": (-0.5,1,0), "twist": 10}},
            fingers={"l": (0.4+0.2*t,0.3), "r": (0.4+0.2*t,0.3)}, shape={"smug": 0.6*(1-t), "shock": 0.35*t})
    c = Clip("guy_clinched")
    c.key(0, clinched_pose(0)); c.key(3, clinched_pose(0.1)); c.key(6, clinched_pose(0.6)); c.key(9, clinched_pose(1.0)); c.key(12, clinched_pose(1.0))
    C.append(c)
    c = Clip("guy_flinch_knee"); flinch_seq(c, clinched_pose(1.0), toes=0.035, hand_delay=1); C.append(c)

    # double_over -- f0 == flinch last frame; gradual fold while staggering 2 steps back (0.20 m root motion, guy-local +Y = backward).
    # Engine: when double_over ends, move the guy object back STAGGER m along his facing; knees/hurt/getup/floor/tap are authored in place.
    STAGGER = 0.30
    c = Clip("guy_double_over")
    def dov(t, sway=0, sr=0.0, sl=0.0, lr=0.0, ll=0.0, rs=0.0):
        f_ = knees_in(G_FEET, 1.0)
        f_["r"]["ball"] = [f_["r"]["ball"][0], f_["r"]["ball"][1] + sr, 0.012 + lr]; f_["l"]["ball"] = [f_["l"]["ball"][0], f_["l"]["ball"][1] + sl, 0.012 + ll]
        if lr > 0: f_["r"]["pitch"] = -15
        if ll > 0: f_["l"]["pitch"] = -15
        return Pose(spine={"pelvis": (9+15*t,0,sway), "spine_01": (10+12*t,0,0), "spine_02": (12+14*t,0,0), "spine_03": (8+12*t,0,0), "neck_01": (-2+6*t,0,0), "head": (-3-7*t,sway*2,0)},
            root=(0,0.085+0.045*t+rs,G_ROOTZ-0.035-0.09*t-0.012*(lr+ll>0)), feet=f_, hands=groin_hands(0.80-0.06*t, -0.13+0.01*t, 0.06-0.01*t), fingers=GRIP,
            shape={"shock": 0.85*(1-t), "pain": 0.7+0.3*t, "agony": 0.3*t})
    S = STAGGER
    c.key(0, flinch_end())
    c.key(3, dov(0.08, 1, sr=0.12, lr=0.05, rs=0.07))
    c.key(6, dov(0.22, 2, sr=S, rs=0.15))
    c.key(9, dov(0.50, 0, sr=S, sl=0.14, ll=0.05, rs=0.23))
    c.key(12, dov(0.72, -2, sr=S, sl=S, rs=S))
    c.key(18, dov(1, 2, sr=S, sl=S, rs=S)); c.key(24, dov(1, -1, sr=S, sl=S, rs=S)); c.key(30, dov(1, 0, sr=S, sl=S, rs=S))
    C.append(c)

    # knees (6 keys)
    c = Clip("guy_knees")
    def kneel(t):
        # knee on ground at y=-0.12; ankle behind
        kz = 0.52 * (1 - t) + 0.06 * t
        feet = {"l": {"ankle": [0.19, -0.02 + 0.40 * t, 0.07 + 0.02 * t], "pitch": 40 * t, "yaw": 10, "pole": (0.1, -1, -0.2 * t)},
                "r": {"ankle": [-0.19, -0.02 + 0.40 * t, 0.07 + 0.02 * t], "pitch": 40 * t, "yaw": -10, "pole": (-0.1, -1, -0.2 * t)}}
        return Pose(spine={"pelvis": (24-10*t,0,0), "spine_01": (22,0,0), "spine_02": (26,0,0), "spine_03": (20,0,0), "neck_01": (6,0,0), "head": (-10+4*t,0,0)},
            root=(0,0.13-0.06*t,-0.165-0.36*t), feet=feet, hands=groin_hands(0.74-0.30*t, -0.12-0.02*t), fingers=GRIP, shape={"pain": 1.0, "agony": 0.4+0.4*t})
    for f, t in [(0,0),(6,0.25),(12,0.55),(18,0.85),(24,1.0),(30,1.0)]: c.key(f, kneel(t))
    C.append(c)

    # hurt stance (loop): same legs as idle so strikes still connect; hunched, hands hovering near groin, pain face
    c = Clip("guy_hurt", loop=True)
    def hurt(b):
        return Pose(spine={"pelvis": (2,0,0), "spine_01": (5,0,0), "spine_02": (7+b,0,0), "spine_03": (6,0,0), "neck_01": (2,0,0), "head": (4-b,0,0)},
            root=(0,0.01,G_ROOTZ-0.01), feet=knees_in(G_FEET, 0.25),
            hands={"l": {"target": [0.17,-0.17,0.84+b*0.004], "pole": (0.8,0.8,-0.2), "twist": -30}, "r": {"target": [-0.17,-0.17,0.84+b*0.004], "pole": (-0.8,0.8,-0.2), "twist": 30}},
            fingers=OPEN, shape={"pain": 0.75})
    c.key(0, hurt(0)); c.key(14, hurt(3)); c.key(28, hurt(0))
    C.append(c)
    # get-up from knees to hurt stance
    c = Clip("guy_getup")
    c.key(0, kneel(1.0))
    c.key(10, kneel(0.6).copy(spine={"pelvis": (20,0,0), "spine_01": (20,0,0), "spine_02": (22,0,0), "spine_03": (16,0,0), "neck_01": (6,0,0), "head": (-4,0,0)}))
    c.key(20, kneel(0.2))
    c.key(30, hurt(0))
    C.append(c)

    # floor (hold loop-ish): fetal on right side, head away from Rusana
    def fetal(breath=0.0, tap=None):
        hands = groin_hands(0.0, 0.0)  # placeholder, overwritten in world
        p = Pose(spine={"pelvis": (0,-90,0), "spine_01": (18+breath,0,0), "spine_02": (18,0,0), "spine_03": (14,0,0), "neck_01": (10,0,0), "head": (12,0,0)},
            root=(0,0.30,-0.80),
            legfk={"thigh_l": (-92,0,-6), "calf_l": (118,0,0), "foot_l": (30,0,0), "thigh_r": (-84,0,6), "calf_r": (112,0,0), "foot_r": (30,0,0)},
            fingers=GRIP, shape={"agony": 1.0})
        p.hands = {}
        p.hand_groin = True
        p.tap = tap
        p.ground = 0.085
        return p
    c = Clip("guy_floor", loop=True)
    c.key(0, fetal(0)); c.key(22, fetal(6)); c.key(44, fetal(0))
    C.append(c)
    c = Clip("guy_tap")
    c.key(0, fetal(0)); c.key(6, fetal(2, tap=1.0)); c.key(11, fetal(2, tap=0.0)); c.key(17, fetal(2, tap=1.0)); c.key(22, fetal(2, tap=0.0)); c.key(28, fetal(2, tap=1.0)); c.key(34, fetal(0, tap=0.0))
    C.append(c)
    return R, C

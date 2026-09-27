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

    # ---------- rus_kick_up (8 keys, contact on 4-6) ----------
    c = Clip("rus_kick_up")
    sup  = {"l": {"ball": [0.10,-0.30,0.012], "pitch": -4, "yaw": 10, "pole": (0.25,-1,0.1)}}
    supH = {"l": {"ball": [0.10,-0.30,0.012], "pitch": -26, "yaw": 10, "pole": (0.25,-1,0.3)}}   # heel lifts
    lean_back = {"pelvis": (2,0,4), "spine_01": (-4,0,0), "spine_02": (-5,0,-1), "spine_03": (-3,0,0), "neck_01": (3,0,0), "head": (8,0,2)}
    c.key(0, st.copy(guy="idle", shape={"cold": 0.6}))
    c.key(6, Pose(spine={"pelvis": (-6,0,6), "spine_01": (4,0,0), "spine_02": (4,0,-2), "spine_03": (3,0,0), "neck_01": (-2,0,0), "head": (-2,0,3)},
        root=(0,-0.10,-0.06), feet={"l": {"ball": [0.10,-0.30,0.012], "pitch": -4, "yaw": 10, "pole": (0.25,-1,0.1)},
                                    "r": {"ball": [-0.10,-0.02,0.04], "pitch": -30, "yaw": -12, "pole": (-0.2,-1,0.2)}},
        hands=guard(-0.02), fingers=FIST, shape={"effort": 0.35, "cold": 0.4}, guy="idle"))
    # chamber: knee to ~his mid-thigh height, shin near vertical under knee
    c.key(11, Pose(spine={"pelvis": (-10,0,6), "spine_01": (3,0,0), "spine_02": (3,0,-1), "spine_03": (2,0,0), "neck_01": (0,0,0), "head": (2,0,2)},
        root=(0,-0.16,-0.05), feet=sup,
        legfk={"thigh_r": (-66,0,-2), "calf_r": (84,0,0), "foot_r": (40,0,0)},
        hands=guard(-0.02,-0.02), fingers=FIST, shape={"effort": 0.6}, guy="idle"))
    def kick(Cpt, tp, sv, s, spine, rootz, feet, point=72):
        return Pose(spine=spine, root=(0,0,rootz), feet=feet,
            kick2={"side": "r", "contact": list(Cpt), "shin_from_vert": sv, "s": s, "point": point, "surf": 0.04},
            hands={"l": {"target": [0.16,-0.36,1.10], "pole": (0.6,0.3,-1), "twist": -20},
                   "r": {"target": [-0.20,-0.20,1.02], "pole": (-0.6,0.5,-1), "twist": 20}},
            fingers=FIST)
    # dense, mesh-verified strike trajectory (fitted per frame against the guy mesh in Blender; see blender/optimize_contact.py)
    import json as _json
    fit = _json.load(open('/workspace/bb3d/out/fit_kick.json'))
    fit_spine = {"pelvis": (2,0,4), "spine_01": (-4,0,0), "spine_02": (-5,0,-1), "spine_03": (-3,0,0), "neck_01": (3,0,0), "head": (8,0,2)}
    for fs in sorted(fit, key=int):
        f = int(fs); v = fit[fs]
        eff = 1.0 if 14 <= f <= 19 else 0.8
        c.key(f, kick(g2w((0.0, v["y"], v["z"])), 0, v["sv"], 1.0, fit_spine, 0.0, supH, point=40).copy(
            shape={"effort": eff}, guy=("flinch" if f >= 15 else "idle")))
    c.key(28, Pose(spine={"pelvis": (-8,0,6), "spine_01": (3,0,0), "spine_02": (3,0,-1), "spine_03": (2,0,0), "neck_01": (-1,0,0), "head": (0,0,2)},
        root=(0,-0.12,-0.05), feet=sup,
        legfk={"thigh_r": (-58,0,-2), "calf_r": (104,0,0), "foot_r": (34,0,0)},
        hands=guard(-0.02), fingers=FIST, shape={"effort": 0.3, "smirk": 0.3}, guy="flinch"))
    c.key(36, st.copy(shape={"cold": 0.6, "smirk": 0.3}, guy="double_over"))
    C.append(c)

    # ---------- rus_knee (7 keys, contact on 3-5) ----------
    c = Clip("rus_knee")
    def clinch(dy=0.0):
        return {"l": {"target": list(g2w((-0.15, 0.04 + dy, 1.47))), "pole": (0.8, 0.3, -0.5), "twist": -40, "wrist": (0,0,-25)},
                "r": {"target": list(g2w((0.15, 0.04 + dy, 1.47))), "pole": (-0.8, 0.3, -0.5), "twist": 40, "wrist": (0,0,25)}}
    c.key(0, Pose(spine={"pelvis": (-6,0,3), "spine_01": (4,0,0), "spine_02": (6,0,0), "spine_03": (4,0,0), "neck_01": (-2,0,0), "head": (0,0,2)},
        root=(0,-0.26,-0.045),
        feet={"l": {"ball": [0.11,-0.36,0.012], "pitch": -6, "yaw": 8, "pole": (0.25,-1,0.1)},
              "r": {"ball": [-0.12,-0.14,0.012], "pitch": -10, "yaw": -14, "pole": (-0.3,-1,0.1)}},
        hands=clinch(), fingers=GRIP, shape={"cold": 0.7}, guy="idle"))
    c.key(7, Pose(spine={"pelvis": (-12,0,3), "spine_01": (2,0,0), "spine_02": (4,0,0), "spine_03": (3,0,0), "neck_01": (0,0,0), "head": (2,0,2)},
        root=(0,-0.30,-0.03),
        feet={"l": {"ball": [0.10,-0.36,0.012], "pitch": -20, "yaw": 8, "pole": (0.25,-1,0.3)}},
        legfk={"thigh_r": (-40,0,0), "calf_r": (150,0,0), "foot_r": (48,0,0)},
        hands=clinch(), fingers=GRIP, shape={"effort": 0.5}, guy="idle"))
    def kn(Cpt, pitch_up, spine, rootz, flex=150):
        a = math.radians(pitch_up)
        td = (0.0, -math.cos(a), math.sin(a))
        return Pose(spine=spine, root=(0,0,rootz),
            feet={"l": {"ball": [0.10,-0.40,0.012], "pitch": -38, "yaw": 8, "pole": (0.25,-1,0.4)}},
            knee={"side": "r", "cap": list(Cpt), "pitch_up": pitch_up, "flex": flex, "point": 50, "cap_off": 0.05, "z_follow": 0.6},
            hands=clinch(), fingers=GRIP)
    snap = {"pelvis": (4,0,3), "spine_01": (-5,0,0), "spine_02": (-4,0,0), "spine_03": (-2,0,0), "neck_01": (4,0,0), "head": (6,0,2)}
    fitk = _json.load(open('/workspace/bb3d/out/fit_knee.json'))
    fitk_spine = {"pelvis": (-2,0,3), "spine_01": (0,0,0), "spine_02": (10,0,0), "spine_03": (14,0,0), "neck_01": (-10,0,0), "head": (-6,0,2)}
    for fs in sorted(fitk, key=int):
        f = int(fs); v = fitk[fs]
        eff = 1.0 if 11 <= f <= 17 else 0.7
        c.key(f, kn(g2w((0.0, v["y"], v["z"])), v["sv"], fitk_spine, 0.0).copy(
            shape={"effort": eff}, guy=("flinch" if f >= 12 else "idle")))
    c.key(26, Pose(spine={"pelvis": (-10,0,4), "spine_01": (3,0,0), "spine_02": (4,0,0), "spine_03": (3,0,0), "head": (0,0,2)},
        root=(0,-0.22,-0.05),
        feet={"l": {"ball": [0.10,-0.30,0.012], "pitch": -8, "yaw": 8, "pole": (0.25,-1,0.2)}},
        legfk={"thigh_r": (-34,0,0), "calf_r": (100,0,0), "foot_r": (36,0,0)},
        hands=guard(-0.06), fingers=FIST, shape={"effort": 0.3, "smirk": 0.3}, guy="double_over"))
    c.key(34, st.copy(shape={"smirk": 0.5, "cold": 0.4}, guy="double_over"))
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
G_FEET = {"l": {"ball": [0.33,-0.12,0.012], "pitch": -3, "yaw": 20, "pole": (0.5,-1,0)},
          "r": {"ball": [-0.33,-0.10,0.012], "pitch": -3, "yaw": -20, "pole": (-0.5,-1,0)}}
def g_idle():
    return Pose(spine={"pelvis": (-2,0,0), "spine_01": (1,0,0), "spine_02": (2,0,0), "spine_03": (1,0,0), "neck_01": (-3,0,0), "head": (-4,0,0)},
        root=(0,0,-0.012), feet=copy.deepcopy(G_FEET),
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
    c.key(26, gi.copy(spine={"spine_02": (3.5,0,0), "head": (-3,2,0)}, root=(0,0,-0.02)))
    c.key(52, gi)
    C.append(c)

    # flinch (4 keys): impact lift -> hips back, knees in, hands to groin (hands arrive after her leg leaves)
    c = Clip("guy_flinch")
    lift = copy.deepcopy(G_FEET); lift["l"]["pitch"] = -30; lift["r"]["pitch"] = -30
    flare = {"l": {"target": [0.36,-0.10,0.95], "pole": (0.5,1,0), "twist": -10}, "r": {"target": [-0.36,-0.10,0.95], "pole": (-0.5,1,0), "twist": 10}}
    c.key(0, gi.copy(shape={"shock": 0.7}))
    c.key(3, gi.copy(spine={"pelvis": (-6,0,0), "spine_01": (2,0,0), "spine_02": (2,0,0), "neck_01": (-8,0,0), "head": (-10,0,0)},
        root=(0,0.01,0.045), feet=lift, hands=flare, fingers=OPEN, shape={"shock": 1.0}))
    c.key(8, Pose(spine={"pelvis": (4,0,0), "spine_01": (6,0,0), "spine_02": (8,0,0), "spine_03": (6,0,0), "neck_01": (2,0,0), "head": (4,0,0)},
        root=(0,0.05,-0.02), feet=knees_in(G_FEET, 0.5), hands={"l": {"target": [0.30,-0.16,0.92], "pole": (0.5,1,0), "twist": -20}, "r": {"target": [-0.30,-0.16,0.92], "pole": (-0.5,1,0), "twist": 20}}, fingers=OPEN, shape={"pain": 1.0}))
    c.key(13, Pose(spine={"pelvis": (7,0,0), "spine_01": (9,0,0), "spine_02": (11,0,0), "spine_03": (8,0,0), "neck_01": (4,0,0), "head": (6,0,0)},
        root=(0,0.07,-0.05), feet=knees_in(G_FEET, 0.85), hands=groin_hands(0.85, -0.20, 0.10), fingers=OPEN, shape={"pain": 1.0}))
    c.key(18, Pose(spine={"pelvis": (10,0,0), "spine_01": (12,0,0), "spine_02": (14,0,0), "spine_03": (10,0,0), "neck_01": (4,0,0), "head": (8,0,0)},
        root=(0,0.08,-0.075), feet=knees_in(G_FEET, 1.0), hands=groin_hands(0.83, -0.13), fingers=GRIP, shape={"pain": 1.0}))
    C.append(c)

    # double_over (6 keys)
    c = Clip("guy_double_over")
    def dov(t, sway=0):
        return Pose(spine={"pelvis": (10+14*t,0,sway), "spine_01": (12+10*t,0,0), "spine_02": (14+12*t,0,0), "spine_03": (10+10*t,0,0), "neck_01": (4,0,0), "head": (8-18*t,sway*2,0)},
            root=(0,0.08+0.05*t,-0.075-0.09*t), feet=knees_in(G_FEET, 1.0), hands=groin_hands(0.80-0.06*t, -0.12), fingers=GRIP, shape={"pain": 1.0, "agony": 0.3*t})
    for i, (f, t, sw) in enumerate([(0,0,0),(6,0.4,2),(12,0.75,-2),(18,1,2),(24,1,-1),(30,1,0)]): c.key(f, dov(t, sw))
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
            root=(0,0.01,-0.02), feet=knees_in(G_FEET, 0.25),
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

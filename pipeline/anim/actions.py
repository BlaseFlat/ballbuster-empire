"""v3 action clips (stage-1 open combat): replaces the procedural bone overrides of web v7.

GUY  (guy-local armature space, faces -Y):
  guy_guard_enter, guy_guard (loop)  hands cup the groin, knees in, hip slightly turned
  guy_hip_turn                       hip/thigh turned away (to his right), torso counter-rotates to keep watching her
  guy_step_back                      evasive two-step back, ROOT MOTION baked (+0.28 m back, like double_over)
  guy_run (loop), guy_walk (loop)    in place, stance feet move at exactly the authored speed (meta.speed)
  guy_winded (loop)                  hands on knees, heavy breathing
  guy_catch_leg                      ready (f0) -> grabs her kicking leg (rus_caught) f4 -> hold -> shoves it away f15-f19
  guy_shove                          wind-up (opening) -> two-hand push (contact f19) -> recover; ROOT MOTION baked (0.20 m forward)
  guy_taunt                          cocky "come on" (arms wide, chin up, beckon)
  guy_feint                          fake guard f3-f12, drops it and laughs (opening from f13)
RUSANA (Rusana armature space, faces -Y):
  rus_run (loop)                     in place sprint (meta.speed)
  rus_dash                           explosive start from fight stance; engine moves her by meta.travel (per-frame metres)
  rus_caught (loop)                  kicking leg held at his groin, hopping/balancing on the support leg
  rus_stagger                        pushed back: three stumble steps, recover to stance; ROOT MOTION baked (0.50 m back)
Extra anim_meta fields (clips.EXTRA_META): speed (m/s, loops), root_end ([x, y] armature metres at the last frame,
+y = backward), travel (rus_dash), catch (guy_catch_leg: grab/hold/push frames), contact (guy_shove).
"""
import numpy as np, math, copy
from qmath import *
from poses import Pose, solve, lrot
import clips as CL

FPS = 30
TAU = 2 * math.pi
def sm(x):  # smoothstep 0..1
    x = min(1.0, max(0.0, x)); return x * x * (3 - 2 * x)
def lerp(a, b, t): return a + (b - a) * t
def lerpv(a, b, t): return [lerp(x, y, t) for x, y in zip(a, b)]

def fk_of(R, P):
    E, root = solve(R, copy.deepcopy(P)); D, H = R.fk(E, root); return E, root, D, H

def shift(P, dy=0.0, dx=0.0):
    """Translate a whole pose (root, planted feet, hand targets) in armature space."""
    P = copy.deepcopy(P)
    P.root = P.root + np.array([dx, dy, 0.0])
    for f in P.feet.values():
        k = "ball" if "ball" in f else "ankle"; f[k] = [f[k][0] + dx, f[k][1] + dy, f[k][2]]
    for h in P.hands.values(): h["target"] = [h["target"][0] + dx, h["target"][1] + dy, h["target"][2]]
    return P


# ---------------------------------------------------------------- dense keys: interpolate IK *targets*, solve every frame
# (author2 interpolates joint rotations between keys, which lets planted feet drift when the root moves; here the
#  feet/hand targets themselves are interpolated so a planted foot stays exactly where it was keyed)
def _flat(P):
    d = {}
    for b, e in P.spine.items(): d[("spine", b)] = np.array(e, float)
    d[("root",)] = np.array(P.root, float)
    for s, f in P.feet.items():
        k = "ball" if "ball" in f else "ankle"
        d[("feet", s, k)] = np.array(f[k], float)
        for q in ("pitch", "yaw"): d[("feet", s, q)] = np.array([f.get(q, 0.0)])
        d[("feet", s, "pole")] = np.array(f.get("pole", (0, -1, 0)), float)
    for s, h in P.hands.items():
        d[("hands", s, "target")] = np.array(h["target"], float)
        d[("hands", s, "pole")] = np.array(h.get("pole", (0, 1, -1)), float)
        d[("hands", s, "twist")] = np.array([h.get("twist", 0.0)])
        d[("hands", s, "wrist")] = np.array(h.get("wrist", (0, 0, 0)), float)
    for s, (cu, th) in P.fing.items(): d[("fing", s)] = np.array([cu, th], float)
    for k, v in P.shape.items(): d[("shape", k)] = np.array([v])
    return d

def _unflat(d, like):
    P = copy.deepcopy(like)
    P.spine = {}; P.feet = {}; P.hands = {}; P.fing = {}; P.shape = {}
    for key, v in d.items():
        if key[0] == "spine": P.spine[key[1]] = tuple(v)
        elif key[0] == "root": P.root = v.copy()
        elif key[0] == "feet":
            f = P.feet.setdefault(key[1], {}); f[key[2]] = list(v) if len(v) > 1 else float(v[0])
        elif key[0] == "hands":
            h = P.hands.setdefault(key[1], {}); h[key[2]] = list(v) if len(v) > 1 else float(v[0])
        elif key[0] == "fing": P.fing[key[1]] = (float(v[0]), float(v[1]))
        elif key[0] == "shape": P.shape[key[1]] = float(v[0])
    for f in P.feet.values():
        if "pole" in f: f["pole"] = tuple(f["pole"])
    for h in P.hands.values():
        h["pole"] = tuple(h["pole"]); h["wrist"] = tuple(h["wrist"])
    return P


def mono_hermite(ps, ts, t, loop):
    """Monotone (Fritsch-Carlson) cubic per component: no overshoot, holds stay exactly flat
    (a planted foot keyed at the same spot twice does not drift in between)."""
    ps = [np.asarray(p, float) for p in ps]; n = len(ts)
    if t <= ts[0]: return ps[0].copy()
    if t >= ts[-1]: return ps[-1].copy()
    i = max(j for j in range(n - 1) if ts[j] <= t)
    def slope(j):   # secant j -> j+1
        return (ps[j + 1] - ps[j]) / (ts[j + 1] - ts[j])
    def tan(j):
        if 0 < j < n - 1: a, b = slope(j - 1), slope(j)
        elif loop and n > 2: a, b = slope(n - 2), slope(0)
        else: return ps[j] * 0
        m = np.where(a * b <= 0, 0.0, 2 * a * b / np.where(np.abs(a + b) < 1e-12, 1e-12, a + b))   # harmonic mean
        return m
    t0, t1 = ts[i], ts[i + 1]; h = t1 - t0
    m0 = tan(i) * h; m1 = tan(i + 1) * h
    u = (t - t0) / h; u2 = u * u; u3 = u2 * u
    return (2*u3 - 3*u2 + 1) * ps[i] + (u3 - 2*u2 + u) * m0 + (-2*u3 + 3*u2) * ps[i + 1] + (u3 - u2) * m1

def densify(clip):
    keys = sorted(clip.k, key=lambda x: x[0])
    fl = [_flat(P) for _, P in keys]
    allk = set().union(*[set(d) for d in fl])
    DEF = {"spine": np.zeros(3), "shape": np.zeros(1)}
    for d in fl:
        for k in allk:
            if k not in d:
                if k[0] in DEF: d[k] = DEF[k[0]].copy()
                else: raise KeyError(f"{clip.name}: key {k} missing in some pose")
    ts = [f for f, _ in keys]
    out = []
    for f in range(ts[-1] + 1):
        d = {k: mono_hermite([x[k] for x in fl], ts, f, clip.loop) for k in allk}
        i = max(j for j in range(len(ts)) if ts[j] <= f)
        P = _unflat(d, keys[i][1]); P.guy = keys[i][1].guy
        out.append((f, P))
    clip.k = out
    return clip

# ---------------------------------------------------------------- ponytail secondary motion (Rusana)
def attach_pony(R, clip, gain=1.0, freq=2.1, zeta=0.22):
    """Damped pendulum driven by the head's motion (effective gravity g - a in the head frame), applied to
    pony_02..04 with a one-frame lag per segment. Loops are simulated 4 cycles to reach steady state."""
    import author2 as A2
    clip.post = None
    frames, _ = A2.run(R, clip)
    n = len(frames)
    Hs, Ds = [], []
    for E, root, _ in frames:
        D, H = R.fk(E, root); Hs.append(H["head"]); Ds.append(D["head"])
    Hs = np.array(Hs); dt = 1.0 / FPS
    def acc(i):
        if clip.loop:
            a, b, c = Hs[(i - 1) % (n - 1)], Hs[i % (n - 1)], Hs[(i + 1) % (n - 1)]
        else:
            a, b, c = Hs[max(0, i - 1)], Hs[i], Hs[min(n - 1, i + 1)]
        return (a - 2 * b + c) / (dt * dt)
    w = TAU * freq
    th = np.zeros(2); vel = np.zeros(2)
    out = [None] * n
    cycles = 4 if clip.loop else 1
    for cyc in range(cycles):
        for i in range(n if not clip.loop else n - 1):
            g = np.array([0, 0, -9.81]) - np.clip(acc(i), -40, 40)
            dh = qrot(qconj(Ds[i]), g)
            tgt = np.array([math.atan2(dh[1], -dh[2]), -math.atan2(dh[0], -dh[2])]) * gain
            for _ in range(4):   # substeps
                a_ = -w * w * (th - tgt) - 2 * zeta * w * vel
                vel = vel + a_ * dt / 4; th = th + vel * dt / 4
            th = np.clip(th, -0.9, 0.9)
            out[i] = th.copy()
    if clip.loop: out[n - 1] = out[0]
    for i in range(n):
        if out[i] is None: out[i] = out[i - 1]
    def post(f, E, root):
        E = dict(E)
        for j, (b, k) in enumerate((("pony_02", 0.30), ("pony_03", 0.35), ("pony_04", 0.35))):
            i = f - j
            i = (i % (n - 1)) if clip.loop else max(0, i)
            ax, az = out[i]
            E[b] = qnorm(qmul(E.get(b, QI), lrot(R, b, (math.degrees(ax) * k, 0, math.degrees(az) * k))))
        return E
    clip.post = post
    return clip


def arm_rel(R, P, spec):
    """Hand IK targets given in the chest frame (spine_03) relative to each shoulder, so arm swings follow the
    torso lean/twist. spec[side] = dict(off=(out, fwd, down) m, pole=(out, back, up), twist, wrist)."""
    Q = copy.deepcopy(P); Q.hands = {}
    E, root, D, H = fk_of(R, Q)
    Dc = D["spine_03"]
    hands = {}
    for s, sp in spec.items():
        sg = 1 if s == "l" else -1
        o, f, d = sp["off"]
        t = H["upperarm_" + s] + qrot(Dc, np.array([sg * o, -f, -d]))
        po, pb, pu = sp.get("pole", (0.3, 1.0, -0.3))
        hands[s] = {"target": list(t), "pole": tuple(qrot(Dc, np.array([sg * po, pb, pu]))), "twist": -sg * sp.get("twist", 0.0)}
        if "wrist" in sp: w = sp["wrist"]; hands[s]["wrist"] = (w[0], w[1] * sg, w[2] * sg)
    P.hands = hands
    return P

# ---------------------------------------------------------------- generic in-place gait
def gait(ph, G):
    """ph = cycle phase 0..1 (left foot lands at 0). G = dict of gait params. Returns Pose (in place: stance
    feet slide back at exactly G['v'] m/s in clip space, so the engine's translation keeps them planted)."""
    T = G["T"] / FPS; v = G["v"]; d = G["duty"]
    travel = v * T * d                    # how far a planted foot moves back during its stance
    feet = {}
    for s, off in (("l", 0.0), ("r", 0.5)):
        p = (ph + off) % 1.0
        x = G["fx"] * (1 if s == "l" else -1)
        if p < d:
            u = p / d
            y = G["yc"] + travel * (u - 0.5)
            z = G["bh"]
            pitch = G["p_land"] * (1 - sm(u / 0.5)) if u < 0.5 else G["p_off"] * ((u - 0.5) / 0.5) ** 1.6
        else:
            wv = (p - d) / (1 - d)
            y0 = G["yc"] + travel * 0.5; y1 = G["yc"] - travel * 0.5
            e = sm(wv) if G.get("swing_ease", "s") == "s" else (1 - math.cos(math.pi * wv)) / 2
            y = y0 + (y1 - y0) * e
            z = G["bh"] + G["lift"] * math.sin(math.pi * min(1.0, wv * G.get("lift_skew", 1.0))) ** 0.9 if wv * G.get("lift_skew", 1.0) < 1 else G["bh"] + G["lift"] * 0
            # trailing toe early in swing, dorsiflex before landing
            pk = G["p_swing"]
            pitch = (G["p_off"] + (pk - G["p_off"]) * sm(wv / 0.3)) if wv < 0.3 else (pk + (G["p_land"] - pk) * sm((wv - 0.3) / 0.7))
            y -= G.get("knee_drive", 0.0) * math.sin(math.pi * wv) ** 2
        feet[s] = {"ball": [x, y, z], "pitch": pitch, "yaw": G["yaw"] * (1 if s == "l" else -1),
                   "pole": (G["pole_x"] * (1 if s == "l" else -1), -1, 0.15)}
    c2 = math.cos(2 * TAU * (ph - d / 2))          # +1 at each mid-stance
    bob = G["bob"] * (c2 if G["walk"] else -c2)     # walk: vault over the leg (high at mid-stance); run: lowest at mid-stance
    cl = math.cos(TAU * ph); sl = math.sin(TAU * ph)
    lat = G["lat"] * math.cos(TAU * (ph - d / 2))   # shift over the stance foot
    py = G["pel_yaw"]; lean = G["lean"]
    lagp = ph - G.get("arm_lag", 0.04)
    ca = math.cos(TAU * lagp)
    spine = {"pelvis": (G["pel_x"], G["pel_roll"] * math.sin(TAU * (ph - d / 2)), -py * cl),
             "spine_01": (lean * 0.3, 0, py * 0.3 * cl), "spine_02": (lean * 0.35, 0, py * 0.6 * cl), "spine_03": (lean * 0.35, 0, py * 0.6 * cl),
             "neck_01": (-lean * 0.45 + G["head_bob"] * c2, 0, -py * 0.3 * cl), "head": (-lean * 0.45 - G["pel_x"] * 0.6 + G["head_bob"] * c2, 0, -py * 0.2 * cl)}
    spec = {}
    for s, sg in (("l", 1), ("r", -1)):
        sw = -sg * ca           # +1 = this hand fully forward (right hand forward when the left leg is forward, ph=0)
        spec[s] = {"off": (G["arm_out"] - G.get("arm_in", 0.0) * max(0.0, sw), G["arm_f0"] + G["arm_A"] * sw, G["arm_d0"] - G["arm_lift"] * max(0.0, sw) + G.get("arm_drop", 0.0) * max(0.0, -sw)),
                   "pole": (G["elbow_out"], 1.0, G["elbow_z"]), "twist": G["twist"]}
    P = Pose(spine=spine, root=(lat, G["root_y"], G["rz"] + bob), feet=feet, hands={}, fingers=G["fing"], shape=dict(G["shape"]))
    P.arm_spec = spec
    return P

def gait_clip(name, G, R=None, pony=False):
    c = CL.Clip(name, loop=True)
    for f in range(G["T"] + 1):
        P = gait((f / G["T"]) % 1.0, G); c.key(f, arm_rel(R, P, P.arm_spec))
    CL.EXTRA_META[name] = {"speed": G["v"], "cycle_s": round(G["T"] / FPS, 4)}
    if pony: attach_pony(R, c)
    return c

# ================================================================ GUY
GUY_RUN = dict(T=20, v=1.8, duty=0.38, fx=0.105, yc=-0.105, bh=0.012, lift=0.20, lift_skew=1.0, knee_drive=0.06,
               p_land=4, p_off=38, p_swing=62, yaw=6, pole_x=0.12, walk=False, bob=0.028, lat=0.012,
               pel_yaw=7, pel_x=6, pel_roll=3, lean=13, head_bob=1.5, rz=-0.075, root_y=-0.02,
               arm_out=0.03, arm_in=0.05, arm_f0=0.02, arm_A=0.20, arm_d0=0.36, arm_lift=0.10, arm_drop=0.0,
               elbow_out=0.35, elbow_z=-0.2, twist=35, arm_lag=0.05, fing={"l": (0.8, 0.6), "r": (0.8, 0.6)}, shape={"shock": 0.35, "pain": 0.15})
GUY_WALK = dict(T=32, v=0.95, duty=0.62, fx=0.12, yc=-0.10, bh=0.012, lift=0.075, knee_drive=0.0,
                p_land=2, p_off=30, p_swing=22, yaw=10, pole_x=0.25, walk=True, bob=0.012, lat=0.02,
                pel_yaw=5, pel_x=-1, pel_roll=2.5, lean=4, head_bob=-0.8, rz=-0.058, root_y=0.0,
                arm_out=0.07, arm_in=0.02, arm_f0=0.03, arm_A=0.14, arm_d0=0.56, arm_lift=0.03, arm_drop=0.0,
                elbow_out=0.4, elbow_z=0.1, twist=10, arm_lag=0.06, fing={"l": (0.4, 0.3), "r": (0.4, 0.3)}, shape={"smug": 0.4})

def guy_actions(R, rigpath):
    gi = CL.g_idle(); G_ROOTZ = CL.G_ROOTZ; G_FEET = CL.G_FEET
    C = []
    GRP = {"l": (0.7, 0.5), "r": (0.7, 0.5)}
    OPEN = {"l": (0.3, 0.2), "r": (0.3, 0.2)}

    def groin(P):
        _, _, D, H = fk_of(R, P)
        gp = R.pt(D, H, "pelvis", np.array([0.0, -0.125, 0.855]))
        return gp, D["pelvis"]

    def cup(P, lift=0.0, press=0.0):
        """hands cupped over the groin of pose P (wrists just above/in front, fingers down over it)"""
        gp, Dp = groin(P)
        side = qrot(Dp, np.array([1.0, 0, 0])); fwd = qrot(Dp, np.array([0, -1.0, 0])); up = np.array([0, 0, 1.0])
        l = gp + side * 0.05 + fwd * (0.035 - press) + up * (0.055 + lift)
        r = gp - side * 0.035 + fwd * (0.06 - press) + up * (0.035 + lift)
        return {"l": {"target": list(l), "pole": list(qrot(Dp, np.array([1, 0.7, -0.2]))), "twist": -55, "wrist": (0, 0, -25)},
                "r": {"target": list(r), "pole": list(qrot(Dp, np.array([-1, 0.7, -0.2]))), "twist": 55, "wrist": (0, 0, 25)}}

    # ---------------- guard ----------------
    def guard(b=0.0, s=0.0, amt=1.0):
        P = Pose(spine={"pelvis": (2 + 3 * amt, 0, 9 * amt + s), "spine_01": (1 + 5 * amt, 0, -3 * amt), "spine_02": (2 + 6 * amt + b, 0, -3 * amt - s * 0.5),
                        "spine_03": (1 + 5 * amt + b * 0.5, 0, -2 * amt), "neck_01": (-3 - 5 * amt - b * 0.5, 0, -1 * amt), "head": (-4 - 6 * amt - b * 0.6, 0, -2 * amt)},
                 root=(0.008 * s, 0.045 * amt, G_ROOTZ - 0.045 * amt + 0.004 * b), feet=CL.knees_in(G_FEET, 0.8 * amt), hands={},
                 fingers=GRP, shape={"shock": 0.3 * amt, "smug": 0.6 * (1 - amt)})
        P.hands = cup(P, lift=0.004 * b)
        return P
    c = CL.Clip("guy_guard_enter")
    mid = guard(0, 0, 0.55); mid.hands = {"l": {"target": [0.17, -0.14, 0.9], "pole": (0.9, 0.8, -0.2), "twist": -35}, "r": {"target": [-0.15, -0.15, 0.89], "pole": (-0.9, 0.8, -0.2), "twist": 35}}
    mid.fing = OPEN
    over = guard(1.5, 0, 1.12); over.hands = cup(over, lift=-0.01, press=0.01)
    c.key(0, gi); c.key(3, mid); c.key(6, over); c.key(9, guard(0, 0))
    C.append(densify(c))
    c = CL.Clip("guy_guard", loop=True)       # 1.33 s breathing hold with a little weight shift
    for f, b, s in ((0, 0, 0), (10, 1.6, 0.6), (20, 0.3, 0.9), (30, 1.4, 0.2), (40, 0, 0)): c.key(f, guard(b, s))
    C.append(densify(c))

    # ---------------- hip turn (to his right: -Z yaw), torso counter-rotates ----------------
    def hip(t, bob=0.0):
        f = copy.deepcopy(G_FEET)
        f["l"]["pitch"] = -3 + 30 * t; f["l"]["yaw"] = 18 - 20 * t; f["l"]["pole"] = (lerp(0.45, -1.5, t), -1, 0.15)
        f["r"]["pole"] = (lerp(-0.45, -0.9, t), -1, 0)
        P = Pose(spine={"pelvis": (-2 + 2 * t, 3 * t, -36 * t), "spine_01": (1 + 2 * t, 0, 8 * t), "spine_02": (2 + 3 * t, 0, 8 * t), "spine_03": (1 + 2 * t, 0, 6 * t),
                        "neck_01": (-3 - 2 * t, 0, 4 * t), "head": (-4 - 2 * t + bob, 0, 5 * t)},
                 root=(-0.035 * t, 0.025 * t, G_ROOTZ - 0.03 * t + 0.004 * bob),
                 feet=f,
                 hands={"l": {"target": lerpv([0.25, -0.02, 0.88], [0.02, -0.21, 0.93 + 0.004 * bob], t), "pole": (lerp(0.5, 1.0, t), 1, -0.2), "twist": -10 - 40 * t},
                        "r": {"target": lerpv([-0.25, -0.02, 0.88], [-0.30, 0.06, 0.92], t), "pole": (-0.6, 1, 0.1), "twist": 10}},
                 fingers={"l": (0.4 + 0.3 * t, 0.3), "r": (0.4, 0.3)}, shape={"smug": 0.6 - 0.3 * t, "shock": 0.15 * t})
        return P
    c = CL.Clip("guy_hip_turn")
    c.key(0, gi); c.key(3, hip(0.25)); c.key(6, hip(0.95)); c.key(8, hip(1.06)); c.key(12, hip(0.98, 1)); c.key(18, hip(1.0, -0.5)); c.key(26, hip(1.0))
    C.append(densify(c))

    # ---------------- step back (root motion 0.28 m back = +Y) ----------------
    SB = 0.28
    def sbpose(ry, rz, lean, feet_mod, arms, shape):
        f = copy.deepcopy(G_FEET)
        for s, m in feet_mod.items(): f[s].update(m)
        return Pose(spine={"pelvis": (-2 - lean * 0.4, 0, 0), "spine_01": (1 - lean * 0.3, 0, 0), "spine_02": (2 - lean * 0.3, 0, 0), "spine_03": (1 - lean * 0.2, 0, 0),
                           "neck_01": (-3 + lean * 0.5, 0, 0), "head": (-4 + lean * 0.5, 0, 0)},
                    root=(0, ry, G_ROOTZ + rz), feet=f, hands=arms, fingers={"l": (0.45, 0.3), "r": (0.45, 0.3)}, shape=shape)
    def arms(ay, az, dy=0.0):
        return {"l": {"target": [0.27, ay + dy, az], "pole": (0.6, 1, 0), "twist": -15}, "r": {"target": [-0.27, ay + dy, az], "pole": (-0.6, 1, 0), "twist": 15}}
    LB, RB = G_FEET["l"]["ball"], G_FEET["r"]["ball"]
    c = CL.Clip("guy_step_back")
    c.key(0, gi)
    c.key(2, sbpose(0.03, -0.02, 5, {"r": {"pitch": 10}}, arms(-0.08, 0.93, 0.03), {"shock": 0.4}))
    c.key(4, sbpose(0.09, -0.005, 9, {"r": {"ball": [RB[0], RB[1] + 0.12, 0.06], "pitch": -6}, "l": {"pitch": 4}}, arms(-0.12, 0.97, 0.09), {"shock": 0.55}))
    c.key(6, sbpose(0.16, -0.02, 8, {"r": {"ball": [RB[0], RB[1] + SB, 0.012], "pitch": -3}, "l": {"pitch": 16}}, arms(-0.10, 0.95, 0.16), {"shock": 0.5}))
    c.key(8, sbpose(0.215, -0.035, 4, {"r": {"ball": [RB[0], RB[1] + SB, 0.012]}, "l": {"ball": [LB[0], LB[1] + 0.14, 0.055], "pitch": -4}}, arms(-0.05, 0.92, 0.215), {"shock": 0.35, "smug": 0.2}))
    c.key(10, sbpose(0.265, -0.045, -1, {"r": {"ball": [RB[0], RB[1] + SB, 0.012]}, "l": {"ball": [LB[0], LB[1] + SB, 0.012], "pitch": -2}}, arms(-0.01, 0.89, 0.265), {"smug": 0.4}))
    c.key(13, shift(gi, SB).copy(root=(0, SB, G_ROOTZ - 0.012)))
    c.key(16, shift(gi, SB))
    C.append(densify(c))
    CL.EXTRA_META["guy_step_back"] = {"root_end": [0.0, SB], "root_track": root_track(c)}

    # ---------------- locomotion ----------------
    C.append(gait_clip("guy_run", GUY_RUN, R))
    C.append(gait_clip("guy_walk", GUY_WALK, R))

    # ---------------- winded: hands on knees, heavy breathing ----------------
    def winded(b):   # b 0 = exhaled, 1 = inhaled
        f = copy.deepcopy(G_FEET)
        f["l"]["pole"] = (0.6, -1, 0); f["r"]["pole"] = (-0.6, -1, 0)
        P = Pose(spine={"pelvis": (20, 0, 0), "spine_01": (13 - 3 * b, 0, 0), "spine_02": (13 - 4 * b, 0, 0), "spine_03": (9 - 3 * b, 0, 0),
                        "neck_01": (-14 + 3 * b, 0, 0), "head": (-16 + 4 * b, 0, 0)},
                 root=(0, 0.12, G_ROOTZ - 0.145 + 0.012 * b), feet=f, hands={}, fingers={"l": (0.25, 0.3), "r": (0.25, 0.3)},
                 shape={"shock": 0.25 + 0.35 * b, "pain": 0.35})
        _, _, D, H = fk_of(R, P)
        for s, sg in (("l", 1), ("r", -1)):
            k = H["calf_" + s]
            P.hands[s] = {"target": [k[0] - sg * 0.005, k[1] - 0.06, k[2] + 0.125 + 0.006 * b], "pole": (sg * 1.0, 0.6, 0.2), "twist": -sg * 20, "wrist": (0, 0, -sg * 10)}
        return P
    c = CL.Clip("guy_winded", loop=True)          # two heaving breaths per 1.2 s loop
    for f, b in ((0, 0), (7, 1), (18, 0), (25, 1), (36, 0)): c.key(f, winded(b))
    C.append(densify(c))

    # ---------------- catch leg (her leg = rus_caught, guy at the kick placement distance) ----------------
    Rr = CL.Rig(rigpath.replace("guy_rig", "rusana_rig"))
    A, K, heel = caught_leg_points(Rr)                 # Rusana space
    gm = KICK_GM
    to_g = lambda p: np.array([-p[0], gm - p[1], p[2]])
    Ag, Kg, Hg = to_g(A), to_g(K), to_g(heel)
    shin = (Kg - Ag) / np.linalg.norm(Kg - Ag)
    def catchp(t_hold, lean=0.0, push=0.0, hands_on=1.0, shape=None):
        rh = Ag + np.array([-0.045, 0.02, -0.035])              # right hand under/around her ankle
        lh = Ag + shin * 0.10 + np.array([0.025, 0, 0.045])      # left hand over her shin
        ready_r = np.array([-0.14, -0.30, 0.84]); ready_l = np.array([0.14, -0.30, 0.86])
        pv = np.array([0, -0.26 * push, 0.07 * push])
        rt = ready_r * (1 - hands_on) + rh * hands_on + pv; lt = ready_l * (1 - hands_on) + lh * hands_on + pv
        P = Pose(spine={"pelvis": (-1 + 5 * t_hold, 0, 4 * t_hold), "spine_01": (2 + 6 * t_hold + 5 * push - lean, 0, 0), "spine_02": (3 + 6 * t_hold + 4 * push - lean, 0, -2 * t_hold),
                        "spine_03": (2 + 5 * t_hold + 3 * push, 0, 0), "neck_01": (-4 - 2 * t_hold, 0, 0), "head": (-6 - 3 * t_hold, 0, 0)},
                 root=(0, 0.02 + 0.06 * t_hold - 0.05 * push, G_ROOTZ - 0.03 - 0.045 * t_hold), feet=CL.knees_in(G_FEET, 0.35),
                 hands={"l": {"target": list(lt), "pole": (1.0, 0.4, -0.6), "twist": -60 * hands_on, "wrist": (0, 0, -10)},
                        "r": {"target": list(rt), "pole": (-1.0, 0.4, -0.9), "twist": 70 * hands_on, "wrist": (0, 0, 25)}},
                 fingers={"l": (0.3 + 0.5 * hands_on * (1 - push), 0.4), "r": (0.3 + 0.55 * hands_on * (1 - push), 0.5)},
                 shape=shape or {"smug": 0.5 + 0.5 * t_hold})
        return P
    c = CL.Clip("guy_catch_leg")
    c.key(0, catchp(0, hands_on=0, shape={"smug": 0.5, "shock": 0.1}))
    c.key(4, catchp(0.6, hands_on=1.0))
    c.key(6, catchp(1.0, hands_on=1.0, lean=1))
    c.key(10, catchp(1.0, hands_on=1.0, lean=2))
    c.key(15, catchp(1.0, hands_on=1.0, lean=-1, push=0.1))
    c.key(19, catchp(0.5, hands_on=1.0, push=1.0, shape={"smug": 1.0}))
    c.key(23, catchp(0.2, hands_on=0.5, push=0.7, shape={"smug": 1.0}))
    c.key(34, gi.copy(shape={"smug": 1.0}))
    C.append(densify(c))
    CL.EXTRA_META["guy_catch_leg"] = {"catch": {"ready_f": 0, "grab_f": 4, "hold_to_f": 15, "push_f": 19, "rus_clip": "rus_caught", "dist_m": abs(gm)}}

    # ---------------- shove (wind-up = opening, push contact f19, root motion 0.20 m forward) ----------------
    SF = -0.20
    def shv(ry, rz, lean, hy, hz, lfoot=None, rfoot=None, spread=0.17, shape=None, fing=0.35):
        f = copy.deepcopy(G_FEET)
        if lfoot: f["l"].update(lfoot)
        if rfoot: f["r"].update(rfoot)
        return Pose(spine={"pelvis": (-2 + lean * 0.3, 0, 0), "spine_01": (1 + lean * 0.3, 0, 0), "spine_02": (2 + lean * 0.35, 0, 0), "spine_03": (1 + lean * 0.3, 0, 0),
                           "neck_01": (-3 - lean * 0.3, 0, 0), "head": (-4 - lean * 0.4, 0, 0)},
                    root=(0, ry, G_ROOTZ + rz), feet=f,
                    hands={"l": {"target": [spread, hy, hz], "pole": (1, 1, -0.6), "twist": -70, "wrist": (0, 0, -35)},
                           "r": {"target": [-spread, hy, hz], "pole": (-1, 1, -0.6), "twist": 70, "wrist": (0, 0, 35)}},
                    fingers={"l": (fing, 0.2), "r": (fing, 0.2)}, shape=shape or {"shock": 0.2, "smug": 0.3})
    c = CL.Clip("guy_shove")
    c.key(0, gi)
    c.key(5, shv(0.03, -0.03, -6, -0.13, 1.14, rfoot={"pitch": -3}, shape={"smug": 0.2, "shock": 0.3}))
    c.key(12, shv(0.045, -0.04, -8, -0.09, 1.15, shape={"shock": 0.35}))
    c.key(15, shv(0.0, -0.035, -2, -0.14, 1.16, lfoot={"ball": [LB[0], LB[1] - 0.10, 0.06], "pitch": -8}, rfoot={"pitch": 12}, shape={"shock": 0.5}))
    c.key(18, shv(-0.13, -0.05, 12, -0.50, 1.20, lfoot={"ball": [LB[0], LB[1] + SF, 0.012]}, rfoot={"pitch": 28}, spread=0.16, shape={"shock": 0.7}, fing=0.15))
    c.key(19, shv(-0.15, -0.055, 14, -0.57, 1.19, lfoot={"ball": [LB[0], LB[1] + SF, 0.012]}, rfoot={"pitch": 32}, spread=0.16, shape={"shock": 0.7}, fing=0.1))
    c.key(22, shv(-0.17, -0.05, 7, -0.40, 1.12, lfoot={"ball": [LB[0], LB[1] + SF, 0.012]}, rfoot={"ball": [RB[0], RB[1] + SF * 0.5, 0.06], "pitch": 0}, shape={"smug": 0.6}))
    c.key(25, shift(gi, SF).copy(root=(0, SF, G_ROOTZ - 0.015), shape={"smug": 0.9}))
    c.key(30, shift(gi, SF).copy(shape={"smug": 1.0}))
    C.append(densify(c))
    CL.EXTRA_META["guy_shove"] = {"root_end": [0.0, SF], "root_track": root_track(c), "contact": {"windup_end_f": 15, "push_f": 19}}

    # ---------------- taunt: arms wide, chin up, beckon ----------------
    def taunt(t, beck=0.0, hipx=0.0):
        P = Pose(spine={"pelvis": (-4 * t, 2 * t, 4 * t), "spine_01": (1 - 4 * t, 0, 0), "spine_02": (2 - 4 * t, 0, -2 * t), "spine_03": (1 - 3 * t, 0, -2 * t),
                        "neck_01": (-3 - 3 * t, 0, 0), "head": (-4 - 8 * t, -4 * t, -4 * t)},
                 root=(0.03 * t + hipx, -0.02 * t, G_ROOTZ + 0.012 * t), feet=copy.deepcopy(G_FEET),
                 hands={"l": {"target": lerpv([0.25, -0.02, 0.88], [0.20, 0.03, 0.99], t), "pole": (1, 0.3, 0.2), "twist": -10 - 60 * t, "wrist": (0, 0, -30 * t)},
                        "r": {"target": lerpv([-0.25, -0.02, 0.88], [-0.20, -0.33 + 0.02 * beck, 1.17 + 0.03 * beck], t), "pole": (-1.0, 0.5, -0.6), "twist": 10 + 95 * t, "wrist": (-35 * beck, 0, 10 * t)}},
                 fingers={"l": (0.4, 0.3), "r": (0.15 + 0.75 * beck, 0.2)}, shape={"smug": 0.6 + 0.4 * t})
        f = P.feet; f["r"]["pole"] = (-0.2, -1, 0); f["l"]["pole"] = (0.6, -1, 0)
        return P
    c = CL.Clip("guy_taunt")
    c.key(0, gi); c.key(6, taunt(1.0)); c.key(10, taunt(1.0, 0, 0.005)); c.key(13, taunt(1.0, 1.0)); c.key(16, taunt(1.0, 0.0)); c.key(19, taunt(1.0, 1.0, -0.004)); c.key(22, taunt(1.0, 0.1))
    c.key(26, taunt(0.6)); c.key(31, gi.copy(shape={"smug": 1.0}))
    C.append(densify(c))

    # ---------------- feint: fake guard, then drop it and laugh ----------------
    def laugh(k):
        P = Pose(spine={"pelvis": (-4, 0, 0), "spine_01": (-2 + k, 0, 0), "spine_02": (-3 + k * 1.5, 0, 0), "spine_03": (-2 + k, 0, 0), "neck_01": (-4, 0, 0), "head": (-10 + k * 2, 0, 0)},
                 root=(0, -0.01, G_ROOTZ + 0.004 - 0.004 * k), feet=copy.deepcopy(G_FEET),
                 hands={"l": {"target": [0.34, -0.24, 1.00 + 0.012 * k], "pole": (1, 0.6, -0.5), "twist": -95, "wrist": (-15, 0, -10)},
                        "r": {"target": [-0.34, -0.24, 1.00 + 0.012 * k], "pole": (-1, 0.6, -0.5), "twist": 95, "wrist": (-15, 0, 10)}},
                 fingers={"l": (0.15, 0.2), "r": (0.15, 0.2)}, shape={"smug": 1.0})
        return P
    c = CL.Clip("guy_feint")
    c.key(0, gi); c.key(3, guard(0, 0, 1.1)); c.key(6, guard(1, 0.3)); c.key(10, guard(0.5, 0.5)); c.key(12, guard(0.3, 0.3, 0.8))
    c.key(15, laugh(0)); c.key(18, laugh(1)); c.key(21, laugh(0)); c.key(24, laugh(1)); c.key(27, laugh(0.2)); c.key(30, laugh(0.8)); c.key(38, gi.copy(shape={"smug": 1.0}))
    C.append(densify(c))
    return C

# ================================================================ RUSANA
KICK_GM = -0.6666                  # kick placement (strike_params.json kick.guy_m): guy origin Y in Rusana space
def caught_ankle():
    # held in front of his groin (guy-local y -0.12, 0.80 m high) → Rusana space
    return np.array([0.0, KICK_GM + 0.13, 0.80])

def rus_caught_pose(k=0.0, hop=0.0, sway=0.0, flail=0.0):
    """k = loop phase 0..1; her right ankle stays fixed (he holds it), she hops on the left foot and balances."""
    st = CL.rus_stance()
    A = caught_ankle()
    s1 = math.sin(TAU * k); c1 = math.cos(TAU * k)
    ball = [0.10 + 0.01 * sway, -0.10, 0.012 + hop]
    P = Pose(spine={"pelvis": (-10, -3 + 3 * sway, 14), "spine_01": (-6, 2 * sway, -3), "spine_02": (-6, 2 * sway, -3), "spine_03": (-4, 1.5 * sway, -2),
                    "neck_01": (9, 0, -4), "head": (12, -3 * sway, -6)},
             root=(0.035 + 0.02 * sway, 0.07, -0.08 + hop * 0.9),
             feet={"l": {"ball": ball, "pitch": 10 + 30 * hop / 0.035, "yaw": 12, "pole": (0.3, -1, 0.2)},
                   "r": {"ankle": list(A), "pitch": -48, "yaw": -8, "pole": (-0.25, -0.5, 1.0)}},
             hands={"l": {"target": [0.42 + 0.03 * flail, -0.14 + 0.05 * s1, 1.14 + 0.07 * c1], "pole": (0.3, 0.4, -1), "twist": -30},
                    "r": {"target": [-0.40 - 0.03 * flail, 0.18 - 0.05 * c1, 1.06 + 0.07 * s1], "pole": (-0.3, 0.6, -1), "twist": 30}},
             fingers={"l": (0.25, 0.3), "r": (0.25, 0.3)}, shape={"effort": 0.55, "cold": 0.45})
    return P

def caught_leg_points(R):
    E, root, D, H = fk_of(R, rus_caught_pose())
    heel = R.pt(D, H, "foot_r", R.head["foot_r"] + np.array([0, 0.045, -0.05]))
    return H["foot_r"], H["calf_r"], heel

RUS_RUN = dict(T=16, v=3.2, duty=0.32, fx=0.06, yc=-0.10, bh=0.011, lift=0.19, lift_skew=1.0, knee_drive=0.10,
               p_land=4, p_off=40, p_swing=70, yaw=4, pole_x=0.1, walk=False, bob=0.03, lat=0.01,
               pel_yaw=8, pel_x=4, pel_roll=3, lean=15, head_bob=1.5, rz=-0.085, root_y=-0.02,
               arm_out=0.02, arm_in=0.05, arm_f0=0.02, arm_A=0.19, arm_d0=0.30, arm_lift=0.10, arm_drop=0.0,
               elbow_out=0.3, elbow_z=-0.2, twist=30, arm_lag=0.05, fing={"l": (0.9, 0.7), "r": (0.9, 0.7)}, shape={"cold": 0.8, "effort": 0.35})

def rus_actions(R):
    C = []
    st = CL.rus_stance()
    # ---------------- run ----------------
    C.append(gait_clip("rus_run", RUS_RUN, R, pony=True))

    # ---------------- dash: explosive start from fight stance ----------------
    # world-space footplants; the engine moves her by travel(t) (stored in meta), clip = world - travel → planted feet don't slide
    V, tau = 3.4, 0.07
    N = 12
    trav = [V * (f / FPS - tau * (1 - math.exp(-(f / FPS) / tau))) for f in range(N + 1)]
    LB0, RB0 = st.feet["l"]["ball"], st.feet["r"]["ball"]
    # plants: (foot, world y, lift-off frame, land frame)
    R_land_y = -0.78; L_land_y = -1.25
    def foot_at(s, f):
        s_ = trav[f]
        if s == "r":
            if f <= 2: return [RB0[0], RB0[1] + s_, 0.011], -10 + 18 * f / 2           # pushing off, heel rising
            if f < 7:
                w = (f - 2) / 5; y = lerp(RB0[1], R_land_y, sm(w)) + s_
                return [lerp(RB0[0], -0.06, w), y - 0.05 * math.sin(math.pi * w), 0.011 + 0.16 * math.sin(math.pi * w) ** 0.9], lerp(8, 62, sm(w / 0.35)) if w < 0.35 else lerp(62, 4, sm((w - 0.35) / 0.65))
            if f <= 10: return [-0.06, R_land_y + s_, 0.011], 4 + 36 * ((f - 7) / 3) ** 1.6
            w = (f - 10) / 6; return [-0.06, lerp(R_land_y, -1.8, sm(w)) + s_, 0.011 + 0.16 * math.sin(math.pi * w)], lerp(40, 62, sm(w / 0.35))
        else:
            if f <= 4: return [LB0[0], LB0[1] + s_, 0.011], -4 + 44 * (f / 4) ** 1.4
            w = (f - 4) / 7
            if w <= 1: return [lerp(LB0[0], 0.06, w), lerp(LB0[1], L_land_y, sm(w)) + s_ - 0.06 * math.sin(math.pi * w), 0.011 + 0.18 * math.sin(math.pi * w) ** 0.9], lerp(40, 66, sm(w / 0.35)) if w < 0.35 else lerp(66, 4, sm((w - 0.35) / 0.65))
            return [0.06, L_land_y + s_, 0.011], 4
    c = CL.Clip("rus_dash")
    for f in range(N + 1):
        u = f / N
        lean = 6 + 22 * sm(f / 3) - 6 * sm((f - 4) / 8)
        feet = {}
        for s in ("l", "r"):
            b, p = foot_at(s, f)
            feet[s] = {"ball": b, "pitch": p, "yaw": (8 if s == "l" else -12) * (1 - sm(f / 5)), "pole": ((0.15 if s == "l" else -0.15), -1, 0.15)}
        # body: drops and drives forward, bob at each push
        rz = -0.055 - 0.05 * sm(f / 2.5) + 0.03 * sm((f - 3) / 3) - 0.02 * math.sin(math.pi * min(1, max(0, (f - 6) / 4)))
        ry = -0.04 * sm(f / 3) - 0.02
        armph = sm(f / 5)
        # arms pump: left arm forward while right leg drives (f2-f7), then swap
        swing = math.cos(math.pi * min(1.0, max(0.0, (f - 1) / 7)))
        a_l = max(0.0, swing); a_r = max(0.0, -swing)
        spec = {"l": {"off": (lerp(0.05, 0.03, armph), lerp(0.20, 0.02 + 0.22 * swing, armph), lerp(0.10, 0.32 - 0.10 * a_l, armph)), "pole": (0.3, 1, -0.2), "twist": 30},
                "r": {"off": (lerp(0.02, 0.03, armph), lerp(0.18, 0.02 - 0.22 * swing, armph), lerp(0.14, 0.32 - 0.10 * a_r, armph)), "pole": (0.3, 1, -0.2), "twist": 30}}
        py = 8 * swing * armph
        P = Pose(spine={"pelvis": (lerp(-4, 5, armph), 0, lerp(6, py, armph)), "spine_01": (lean * 0.3, 0, -py * 0.3), "spine_02": (lean * 0.35, 0, -py * 0.6), "spine_03": (lean * 0.35, 0, -py * 0.6),
                        "neck_01": (-lean * 0.45, 0, 0), "head": (-lean * 0.5, 0, lerp(4, 0, armph))},
                 root=(0.0, ry, rz), feet=feet, hands={}, fingers={"l": (0.9, 0.7), "r": (0.9, 0.7)}, shape={"cold": 0.8, "effort": 0.3 + 0.5 * sm(f / 3)})
        c.key(f, arm_rel(R, P, spec))
    attach_pony(R, c)
    C.append(c)
    CL.EXTRA_META["rus_dash"] = {"travel": [round(t, 4) for t in trav], "speed_end": V, "then": "rus_run"}

    # ---------------- caught: leg held, balancing (loop 0.8 s: two little hops) ----------------
    c = CL.Clip("rus_caught", loop=True)
    NC = 24
    for f in range(NC + 1):
        k = (f % NC) / NC
        hop = 0.035 * max(0.0, math.sin(TAU * 2 * k)) ** 1.5
        sway = math.sin(TAU * k)
        c.key(f, rus_caught_pose(k, hop, sway, flail=math.sin(TAU * 2 * k + 0.6)))
    densify(c); attach_pony(R, c)
    C.append(c)

    # ---------------- stagger: pushed back 0.50 m, three stumble steps, recover (root motion baked) ----------------
    SB = 0.50
    L0, R0 = list(st.feet["l"]["ball"]), list(st.feet["r"]["ball"])
    def stg(ry, rz, lean, lf, rf, hands, shape, roll=0.0, headf=0.0):
        P = _stg(ry, rz, lean, lf, rf, hands, shape, roll, headf)
        return arm_rel(R, P, hands["spec"]) if "spec" in hands else P
    def _stg(ry, rz, lean, lf, rf, hands, shape, roll=0.0, headf=0.0):
        return Pose(spine={"pelvis": (-4 - lean * 0.25, roll, 6), "spine_01": (4 - lean * 0.3, roll * 0.5, -2), "spine_02": (4 - lean * 0.35, roll * 0.5, -3), "spine_03": (3 - lean * 0.3, 0, -2),
                           "neck_01": (-3 + lean * 0.35 + headf, 0, 1), "head": (-3 + lean * 0.3 + headf, 0, 4)},
                    root=(0, ry, rz), feet={"l": lf, "r": rf}, hands=hands, fingers={"l": (0.45, 0.3), "r": (0.45, 0.3)}, shape=shape)
    def F(s, y, z=0.011, pitch=None, yaw=None):
        base = st.feet[s]
        return {"ball": [base["ball"][0], y, z], "pitch": base["pitch"] if pitch is None else pitch, "yaw": base["yaw"] if yaw is None else yaw, "pole": base["pole"]}
    def H(lo, lf, ld, ro, rf, rd, tw=20):
        """chest-relative flail: (out, fwd, down) per hand"""
        return {"spec": {"l": {"off": (lo, lf, ld), "pole": (0.8, 0.3, -0.6), "twist": tw}, "r": {"off": (ro, rf, rd), "pole": (0.8, 0.3, -0.6), "twist": tw}}}
    c = CL.Clip("rus_stagger")
    c.key(0, stg(0.0, -0.06, 4, F("l", L0[1]), F("r", R0[1]), H(0.02, 0.30, 0.02, 0.06, 0.28, 0.06), {"effort": 0.8, "cold": 0.3}, headf=6))
    c.key(2, stg(0.08, -0.05, 16, F("l", L0[1], pitch=6), F("r", R0[1] + 0.08, 0.05, -6), H(0.18, 0.30, -0.12, 0.22, 0.26, -0.08), {"effort": 1.0}, roll=-2, headf=10))
    c.key(5, stg(0.17, -0.07, 18, F("l", L0[1], pitch=22), F("r", R0[1] + 0.24), H(0.40, 0.10, 0.14, 0.36, 0.06, 0.18), {"effort": 1.0}, roll=-4, headf=6))
    c.key(8, stg(0.27, -0.06, 13, F("l", L0[1] + 0.26, 0.06, -6), F("r", R0[1] + 0.24, pitch=8), H(0.34, 0.06, 0.12, 0.32, 0.18, -0.10), {"effort": 0.9}, roll=3))
    c.key(11, stg(0.36, -0.08, 8, F("l", L0[1] + SB), F("r", R0[1] + 0.24, pitch=20), H(0.24, 0.16, 0.20, 0.28, 0.02, 0.10), {"effort": 0.8, "cold": 0.3}, roll=2))
    c.key(14, stg(0.44, -0.075, 3, F("l", L0[1] + SB), F("r", R0[1] + 0.40, 0.045, -4), H(0.10, 0.24, 0.16, 0.12, 0.22, 0.22), {"effort": 0.5, "cold": 0.6}))
    c.key(17, stg(0.49, -0.085, -2, F("l", L0[1] + SB), F("r", R0[1] + SB), guard_h(SB, -0.02), {"cold": 0.9}))
    c.key(21, shift(st, SB).copy(root=(0, SB, -0.068), shape={"cold": 1.0}))
    c.key(26, shift(st, SB).copy(shape={"cold": 0.9}))
    densify(c); attach_pony(R, c)
    C.append(c)
    CL.EXTRA_META["rus_stagger"] = {"root_end": [0.0, SB], "root_track": root_track(c)}
    return C

def root_track(c):
    """per-frame pelvis root displacement [x, y] (armature metres, +y = back) from frame 0 — the engine bakes this
    into the object position when the clip ends or is interrupted (see web js/main.js bakeRoot)."""
    ks = sorted(c.k, key=lambda x: x[0]); r0 = ks[0][1].root
    return [[round(float(P.root[0] - r0[0]), 4), round(float(P.root[1] - r0[1]), 4)] for _, P in ks]

def guard_h(dy=0.0, dz=0.0):
    g = CL.guard(0, dz)
    for h in g.values(): h["target"] = [h["target"][0], h["target"][1] + dy, h["target"][2]]
    return g

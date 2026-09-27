"""IK-centric pose authoring. Armature space: +X char-left, -Y forward, +Z up."""
import numpy as np, math
from qmath import *

def lrot(R, bone, e):
    """bone-local euler (deg) -> armature-space delta E (for D = Dp*E)."""
    r = R.rest[bone]
    return qnorm(qmul(r, qmul(qeuler(e), qconj(r))))

def fingers(R, side, curl=0.6, thumb=0.4, spread=0.0):
    d = {}
    s = 1 if side == "l" else -1
    for i, f in enumerate(("index", "middle", "ring", "pinky")):
        for j, a in zip(("01", "02", "03"), (75, 90, 60)):
            d[f"{f}_{j}_{side}"] = lrot(R, f"{f}_{j}_{side}", (a * curl, 0, (spread * (i - 1.5) * 6) * s if j == "01" else 0))
    for j, a in zip(("01", "02", "03"), (15, 30, 30)):
        d[f"thumb_{j}_{side}"] = lrot(R, f"thumb_{j}_{side}", (a * thumb, 0, 0))
    return d

class Pose:
    def __init__(self, **kw):
        self.spine = kw.get("spine", {})          # bone -> armature euler (deg)
        self.root = np.array(kw.get("root", (0, 0, 0)), float)
        self.feet = kw.get("feet", {})            # side -> dict(ball=(x,y,z) or ankle=(..), pitch, yaw, pole)
        self.hands = kw.get("hands", {})          # side -> dict(target, pole, twist)
        self.kick = kw.get("kick", None)          # dict(side, instep=(x,y,z), pole, point)
        self.knee = kw.get("knee", None)          # dict(side, cap=(x,y,z), thigh_dir, flex, solve_root)
        self.legfk = kw.get("legfk", {})          # bone->euler direct
        self.fing = kw.get("fingers", {"l": (0.8, 0.5), "r": (0.8, 0.5)})
        self.extra = kw.get("extra", {})          # bone->local euler, applied last
        self.shape = kw.get("shape", {})
        self.guy = kw.get("guy", None)
        self.kick2 = kw.get("kick2", None)
        self.aim = kw.get("aim", {})
        self.leg3 = kw.get("leg3", {})            # side -> dict(flex=hip flexion deg (0 hang, 90 horizontal), knee=inner angle deg, point=foot deg, aim_x=world x of knee, abd)
    def copy(self, **kw):
        import copy
        p = copy.deepcopy(self)
        for k, v in kw.items():
            if k == "root": v = np.array(v, float)
            if k in ("spine", "feet", "hands", "extra", "legfk") and isinstance(v, dict):
                d = getattr(p, k); d.update(copy.deepcopy(v)); v = d
            setattr(p, k, v)
        return p

LEG = lambda s: ("thigh_" + s, "calf_" + s, "foot_" + s)
ARM = lambda s: ("upperarm_" + s, "lowerarm_" + s, "hand_" + s)

def solve(R, P):
    E = {}
    for b, e in P.spine.items(): E[b] = qeuler(e)
    for b, e in P.legfk.items(): E[b] = qeuler(e)
    root = P.root.copy()
    # knee strike: solve root so kneecap lands at target with given thigh direction
    if P.knee:
        k = P.knee; s = k["side"]; th, ca, fo = LEG(s)
        l1 = np.linalg.norm(R.head[ca] - R.head[th]); l2 = np.linalg.norm(R.head[fo] - R.head[ca])
        a = math.radians(k["pitch_up"])       # thigh elevation above horizontal
        cap = np.asarray(k["cap"], float)
        up_perp = np.array([0.0, -math.sin(a), math.cos(a)]) * 0 + np.array([0.0, math.sin(a), math.cos(a)])
        # thigh dir in y,z plane (forward -Y, up +Z); kneecap is on the front of knee, i.e. along thigh dir beyond joint, and on top
        td_yz = np.array([0.0, -math.cos(a), math.sin(a)])
        K = cap - td_yz * k.get("cap_off", 0.05) - up_perp * 0.01
        D, H = R.fk(E, root)
        hip = H[th]
        # solve root y,z so that |K-hip| = l1 with elevation a (x offset allowed)
        dx = K[0] - hip[0]
        hl = math.sqrt(max(l1 * l1 - dx * dx, 1e-6))
        want = np.array([hip[0], K[1] + hl * math.cos(a), K[2] - hl * math.sin(a)])
        delta = want - hip; delta[0] = 0.0
        root = root + delta * np.array([0, 1.0, k.get("z_follow", 1.0)])
        D, H = R.fk(E, root)
        hip = H[th]
        td = (K - hip) / np.linalg.norm(K - hip)
        K = hip + td * l1
        phi = math.radians(k.get("flex", 150))
        side_ax = np.cross(td, np.array([0, 0, 1.0])); side_ax /= np.linalg.norm(side_ax)
        fold_perp = np.cross(side_ax, td); fold_perp /= np.linalg.norm(fold_perp)   # "up" relative to thigh
        sd = td * math.cos(phi) - fold_perp * math.sin(phi)
        A = K + sd * l2
        E, Dl = R.aim_leg(E, root, s, K, A)
        Df = qmul(Dl, qeuler((k.get("point", 40), 0, 0)))
        E[fo] = qnorm(qmul(qconj(Dl), Df))
        P._dbg = {"K": K, "A": A, "hip": hip}
    if getattr(P, "kick2", None):
        k = P.kick2; s = k["side"]; th, ca, fo = LEG(s)
        l1 = np.linalg.norm(R.head[ca] - R.head[th]); l2 = np.linalg.norm(R.head[fo] - R.head[ca])
        sv = math.radians(k["shin_from_vert"])
        d_s = np.array([0.0, -math.sin(sv), math.cos(sv)])
        n = np.array([0.0, math.cos(sv), math.sin(sv)]) * 0 + np.array([0.0, 0.35, 1.0]) / np.linalg.norm([0.0, 0.35, 1.0])
        Cp = np.asarray(k["contact"], float)
        A_s = Cp - n * k.get("surf", 0.045)
        K = A_s - d_s * k["s"] * l2
        D, H = R.fk(E, root)
        hip = H[th]
        dz = hip[2] - K[2]
        if dz > l1 * 0.98: dz = l1 * 0.98
        horiz = math.sqrt(max(l1 * l1 - dz * dz, 1e-6))
        dx = K[0] - hip[0]
        dy = math.sqrt(max(horiz * horiz - dx * dx, 1e-6))
        want_hip_y = K[1] + dy
        root = root + np.array([0.0, want_hip_y - hip[1], 0.0])
        D, H = R.fk(E, root)
        hip = H[th]
        K = hip + (K - hip) / np.linalg.norm(K - hip) * l1
        A = K + d_s * l2
        E, Dl = R.aim_leg(E, root, s, K, A)
        Df = qmul(Dl, qeuler((k.get("point", 70), 0, 0)))
        E[fo] = qnorm(qmul(qconj(Dl), Df))
        P._dbg = {"K": K, "A": A, "hip": hip}
    if P.kick:
        k = P.kick; s = k["side"]; th, ca, fo = LEG(s)
        a0 = R.head[fo]; b0 = R.head["ball_" + s]
        inst_rest = a0 + 0.5 * (b0 - a0) + np.array([0, 0, 0.04])
        tgt = np.asarray(k["instep"], float)
        ank = tgt.copy()
        for it in range(10):
            E2, Dl = R.ik2(E, root, LEG(s), ank, k.get("pole", (0, -1, 0.3)), (0, -1, 0))
            Df = qmul(Dl, qeuler((k.get("point", 55), 0, 0)))
            E2[fo] = qnorm(qmul(qconj(Dl), Df))
            D, H = R.fk(E2, root)
            cp = R.pt(D, H, fo, inst_rest)
            ank = ank + (tgt - cp)
        E = E2
    for s, f in P.feet.items():
        th, ca, fo = LEG(s)
        pitch = f.get("pitch", 0.0); yaw = f.get("yaw", 0.0)
        Df = qmul(qeuler((0, 0, yaw)), qeuler((pitch, 0, 0)))
        if "ball" in f:
            b0 = R.head["ball_" + s]; a0 = R.head[fo]
            ball = np.asarray(f["ball"], float)
            ank = ball + qrot(Df, a0 - b0)
        else:
            ank = np.asarray(f["ankle"], float)
        E, Dl = R.ik2(E, root, LEG(s), ank, f.get("pole", (0, -1, 0)), (0, -1, 0))
        E[fo] = qnorm(qmul(qconj(Dl), Df))
    for s, g in getattr(P, "leg3", {}).items():
        th, ca, fo = LEG(s)
        l1 = np.linalg.norm(R.head[ca] - R.head[th]); l2 = np.linalg.norm(R.head[fo] - R.head[ca])
        D, H = R.fk(E, root); hip = H[th]
        fl = math.radians(g["flex"]); horiz = max(l1 * math.sin(fl), 1e-3)
        fx = 0.0
        if "aim_x" in g: fx = max(-0.7, min(0.7, (g["aim_x"] - hip[0]) / max(horiz, 0.12)))
        f = np.array([fx, -math.sqrt(1 - fx * fx), 0.0]); up = np.array([0, 0, 1.0])
        td = f * math.sin(fl) - up * math.cos(fl)
        pt_ = math.radians(g["flex"] - 90.0)             # thigh elevation
        ps_ = pt_ - math.radians(180.0 - g["knee"])      # shin elevation
        sd = f * math.cos(ps_) + up * math.sin(ps_)
        K = hip + td * l1; A = K + sd * l2
        if "ankle_x" in g: A[0] = g["ankle_x"]; A = K + (A - K) / np.linalg.norm(A - K) * l2
        E, Dl = R.aim_leg(E, root, s, K, A)
        E[fo] = qeuler((g.get("point", 0.0), 0, 0))
    for s, a in getattr(P, "aim", {}).items():
        E, Dl = R.aim_leg(E, root, s, a["knee"], a["ankle"])
        E["foot_" + s] = qnorm(qmul(qconj(Dl), qmul(Dl, qeuler((a.get("pitch", 0), 0, 0)))))
    # hands to own groin (for floor)
    if getattr(P, "hand_groin", False):
        D, H = R.fk(E, root)
        gp = R.pt(D, H, "pelvis", np.array([0.0, -0.13, R.head["pelvis"][2] - 0.10]))
        side_off = qrot(D["pelvis"], np.array([1.0, 0, 0]))
        fwd = qrot(D["pelvis"], np.array([0, -1.0, 0]))
        P.hands = {"l": {"target": list(gp + side_off * 0.04 + fwd * 0.03), "pole": list(qrot(D["pelvis"], np.array([1, 0.6, -0.3]))), "twist": -50},
                   "r": {"target": list(gp - side_off * 0.04 + fwd * 0.03), "pole": list(qrot(D["pelvis"], np.array([-1, 0.6, -0.3]))), "twist": 50}}
        if getattr(P, "tap", None) is not None:
            t = P.tap
            sh = H["upperarm_l"]
            floor_pt = np.array([sh[0] + 0.05, sh[1] - 0.30, 0.04])
            up_pt = floor_pt + np.array([0.0, 0.05, 0.22])
            P.hands["l"] = {"target": list(up_pt * (1 - t) + floor_pt * t), "pole": [0.3, 1.0, 0.5], "twist": 0, "wrist": (0, 0, 0)}
    for s, h in P.hands.items():
        up, lo, ha = ARM(s)
        E, Dl = R.ik2(E, root, ARM(s), np.asarray(h["target"], float), h.get("pole", (0, 1, -1)), (0, 1, 0))
        if "twist" in h:
            E[lo] = qnorm(qmul(E[lo], lrot(R, lo, (0, h["twist"], 0))))
        if "wrist" in h:
            E[ha] = lrot(R, ha, h["wrist"])
    for s, (c, t) in P.fing.items():
        E.update(fingers(R, s, c, t))
    for b, e in P.extra.items():
        E[b] = qnorm(qmul(E.get(b, QI), lrot(R, b, e)))
    return E, root

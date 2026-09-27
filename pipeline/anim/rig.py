import json, numpy as np, math
from qmath import *
LEG = {"l": ("thigh_l","calf_l","foot_l"), "r": ("thigh_r","calf_r","foot_r")}
ARM = {"l": ("upperarm_l","lowerarm_l","hand_l"), "r": ("upperarm_r","lowerarm_r","hand_r")}
FINGERS = ["index","middle","ring","pinky"]
class Rig:
    def __init__(self, path):
        d = json.load(open(path))
        self.names = []
        self.head = {}; self.tail = {}; self.parent = {}; self.rest = {}
        # topological order
        pend = dict(d)
        while pend:
            for n, b in list(pend.items()):
                if b["parent"] is None or b["parent"] in self.head:
                    self.names.append(n); self.head[n] = np.array(b["head"]); self.tail[n] = np.array(b["tail"])
                    self.parent[n] = b["parent"]; self.rest[n] = np.array(b["rest_q"]); del pend[n]
    def fk(self, E, root_off):
        D = {}; H = {}
        for n in self.names:
            e = E.get(n, QI); p = self.parent[n]
            if p is None:
                D[n] = e; H[n] = self.head[n].copy()
            else:
                D[n] = qmul(D[p], e); H[n] = H[p] + qrot(D[p], self.head[n] - self.head[p])
            if n == "pelvis":
                H[n] = H[n] + np.asarray(root_off)
        return D, H
    def pt(self, D, H, bone, x):
        return H[bone] + qrot(D[bone], np.asarray(x) - self.head[bone])
    def local_q(self, n, e):
        r = self.rest[n]
        return qnorm(qmul(qconj(r), qmul(e, r)))
    def ik2(self, E, root_off, chain, target, pole, fwd_rest):
        up, lo, end = chain
        D, H = self.fk(E, root_off)
        p = self.parent[up]
        Dp = D[p]
        h0, k0, a0 = self.head[up], self.head[lo], self.head[end]
        l1 = np.linalg.norm(k0 - h0); l2 = np.linalg.norm(a0 - k0)
        Hj = H[up]
        tv = np.asarray(target) - Hj
        d = np.linalg.norm(tv)
        d = min(max(d, abs(l1 - l2) + 1e-4), l1 + l2 - 1e-4)
        dirv = tv / np.linalg.norm(tv)
        cosA = (l1*l1 + d*d - l2*l2) / (2*l1*d); cosA = max(-1, min(1, cosA))
        A = math.acos(cosA)
        pole = np.asarray(pole, float)
        pl = pole - dirv * np.dot(pole, dirv)
        if np.linalg.norm(pl) < 1e-6: pl = np.array([0,-1,0.0])
        pl = pl / np.linalg.norm(pl)
        K = Hj + dirv * l1 * math.cos(A) + pl * l1 * math.sin(A)
        tgt = Hj + dirv * d
        u_rest = (k0 - h0)
        mid0 = h0 + (a0 - h0) * np.dot(k0 - h0, a0 - h0) / np.dot(a0 - h0, a0 - h0)
        f_auto = k0 - mid0
        f_rest = f_auto if np.linalg.norm(f_auto) > 0.004 else np.asarray(fwd_rest, float)
        u_new = K - Hj
        # knee forward direction in posed: perpendicular to thigh, toward pole side & away from line
        f_new = pl - (u_new/np.linalg.norm(u_new)) * np.dot(pl, u_new/np.linalg.norm(u_new))
        Du = frame_q(u_rest, f_rest, u_new, f_new)
        cur = qrot(Du, a0 - k0); want = tgt - K
        Dl = qmul(qbetween(cur, want), Du)
        E = dict(E)
        E[up] = qnorm(qmul(qconj(Dp), Du))
        E[lo] = qnorm(qmul(qconj(Du), Dl))
        return E, Dl

    def aim_leg(self, E, root, side, knee, ankle):
        up, lo, end = "thigh_"+side, "calf_"+side, "foot_"+side
        D, H = self.fk(E, root)
        Dp = D[self.parent[up]]
        hip = H[up]
        u_new = np.asarray(knee) - hip
        c_dir = np.asarray(ankle) - np.asarray(knee)
        un = u_new/np.linalg.norm(u_new)
        f_new = -(c_dir - un*np.dot(c_dir, un))
        if np.linalg.norm(f_new) < 1e-5: f_new = np.array([0,-1.0,0])
        h0, k0, a0 = self.head[up], self.head[lo], self.head[end]
        mid0 = h0 + (a0 - h0) * np.dot(k0 - h0, a0 - h0) / np.dot(a0 - h0, a0 - h0)
        f_rest = k0 - mid0
        Du = frame_q(k0 - h0, f_rest, u_new, f_new)
        Kp = hip + qrot(Du, k0 - h0)
        Dl = qmul(qbetween(qrot(Du, a0 - k0), np.asarray(ankle) - Kp), Du)
        E = dict(E)
        E[up] = qnorm(qmul(qconj(Dp), Du)); E[lo] = qnorm(qmul(qconj(Du), Dl))
        return E, Dl

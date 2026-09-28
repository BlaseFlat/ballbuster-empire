"""Foot-contact check for the v3 action clips: python3 footcheck.py [clip ...]
For each frame prints ball/heel heights; for grounded frames reports slide speed relative to the expected ground speed
(in-place loops: +speed m/s along +Y; everything else: 0)."""
import sys, json, numpy as np
import author2 as A2, clips as CL
def main(names):
    Rr, rc = CL.build_rusana('/workspace/bb3d/out/rusana_rig.json')
    Rg, gc = CL.build_guy('/workspace/bb3d/out/guy_rig.json')
    for R, cl in ((Rr, rc), (Rg, gc)):
        for c in cl:
            if names and c.name not in names: continue
            fr, _ = A2.run(R, c)
            meta = CL.EXTRA_META.get(c.name, {})
            v = meta.get("speed", 0.0) if c.loop else 0.0
            trav = meta.get("travel")
            worst = 0; rows = []
            prev = None
            for i, (E, root, _) in enumerate(fr):
                D, H = R.fk(E, root)
                pts = {}
                for s in "lr":
                    ball = R.pt(D, H, "foot_" + s, R.head["ball_" + s]); heel = R.pt(D, H, "foot_" + s, R.head["foot_" + s] + np.array([0, 0.04, -0.06]))
                    pts[s] = (ball, heel)
                if prev is not None:
                    for s in "lr":
                        for j, nm in ((0, "ball"), (1, "heel")):
                            p, q = pts[s][j], prev[s][j]
                            if p[2] < 0.02 and q[2] < 0.02:
                                exp = v / 30 if not trav else (trav[i] - trav[i - 1])
                                sl = np.hypot(p[0] - q[0], (p[1] - q[1]) - exp) * 30
                                worst = max(worst, sl)
                                if sl > 0.12: rows.append(f"  f{i} {s}.{nm} slide {sl:.2f} m/s  z={p[2]:.3f}")
                minz = min(min(pts[s][0][2], pts[s][1][2]) for s in "lr")
                if minz < -0.03: rows.append(f"  f{i} penetration {minz:.3f}")
                prev = pts
            print(f"{c.name:18s} frames {len(fr):3d} expected v {v:.2f}  worst grounded slide {worst:.2f} m/s")
            for r in rows[:12]: print(r)
if __name__ == "__main__": main(sys.argv[1:])

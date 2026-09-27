import numpy as np, math
from qmath import *
def ang(a, b):
    a = a / np.linalg.norm(a); b = b / np.linalg.norm(b)
    return math.degrees(math.acos(max(-1, min(1, float(np.dot(a, b))))))
def elev(v):  # elevation above horizontal (deg)
    return math.degrees(math.atan2(v[2], math.hypot(v[0], v[1])))
def leg_metrics(R, E, root, s="r"):
    D, H = R.fk(E, root)
    hip, knee, ank, ball = H["thigh_"+s], H["calf_"+s], H["foot_"+s], H["ball_"+s]
    toe = R.pt(D, H, "ball_"+s, R.tail["ball_"+s])
    th = knee - hip; sh = ank - knee; ft = toe - ank
    out = dict(hip_z=hip[2], knee_z=knee[2], ankle_z=ank[2], knee_inner=180 - ang(th, sh),
               thigh_elev=elev(th), shin_elev=elev(sh), hip_flex=ang(th, np.array([0, 0, -1.0])),
               foot_point=180 - ang(sh, ft), toe=toe, ank=ank, knee=knee, hip=hip)
    return out
def body_metrics(R, E, root):
    D, H = R.fk(E, root)
    v = H["neck_01"] - H["pelvis"]
    lean = math.degrees(math.atan2(-v[1], v[2]))   # + = forward (toward -Y)
    return dict(pelvis=H["pelvis"], lean=lean, heel_l=H["foot_l"][2], heel_r=H["foot_r"][2])

"""Parametric strike poses (single source for clips.py and the Blender lab)."""
import numpy as np, math, copy
from poses import Pose
FIST = {"l": (0.95, 0.8), "r": (0.95, 0.8)}
GRIP = {"l": (0.65, 0.5), "r": (0.65, 0.5)}

# ---------------- KICK ----------------
# Rusana stance (rus_idle): front/support foot = left, kicking = right (rear) leg.
SUP_BALL = [0.12, -0.20, 0.012]
def heel_pitch(rise):          # support-foot pitch for a given ankle rise (m): ankle is 0.119 from ball, 27.5 deg at rest
    # +pitch lifts the heel (ball stays planted); calibrated: pitch 0 -> ankle 0.066, +25 -> 0.107
    return max(-4.0, (math.degrees(math.asin(min(0.99, (0.055 + rise) / 0.119))) - 27.5))
def kick_pose(flex, knee, point, dy=0.0, rise=0.04, lean=12.0, aim_x=-0.02, ankle_x=0.0, arms=1.0, pel_yaw=10.0, shape=None, guy=None):
    """lean = torso lean back (deg, spread over spine), rise = heel lift/body rise (m)."""
    l = lean
    spine = {"pelvis": (2, 0, pel_yaw), "spine_01": (-0.35*l, 0, -2), "spine_02": (-0.35*l, 0, -3), "spine_03": (-0.30*l, 0, -2),
             "neck_01": (0.45*l, 0, 1), "head": (0.45*l, 0, 3)}
    feet = {"l": {"ball": list(SUP_BALL), "pitch": heel_pitch(rise), "yaw": 10, "pole": (0.25, -1, 0.15)}}
    g = {"flex": flex, "knee": knee, "point": point, "aim_x": aim_x}
    if ankle_x is not None: g["ankle_x"] = ankle_x
    # arms: counter-balance (lead hand forward-high guard, rear arm swings back/down)
    a = arms
    hands = {"l": {"target": [0.14, -0.30 + 0.06*(1-a), 1.12 + 0.10*(1-a)], "pole": (0.6, 0.3, -1), "twist": -25},
             "r": {"target": [-0.24, 0.02*a - 0.20*(1-a), 0.98 + 0.22*(1-a)], "pole": (-0.6, 0.6, -1), "twist": 20}}
    return Pose(spine=spine, root=(0, dy, -0.055 + rise), feet=feet, leg3={"r": g}, hands=hands, fingers=FIST,
                shape=shape or {"effort": 1.0}, guy=guy)

# ---------------- KNEE ----------------
def knee_pose(flex, knee, point, dy=0.0, rise=0.03, lean=7.0, aim_x=0.0, hands=None, pull=0.0, shape=None, guy=None, gm=-0.37, sup_y=-0.06, pel_x=4.0,
              head_yaw=40.0, head_roll=12.0, hand_z=1.42, hand_y=-0.11, hand_x=0.12, ankle_x=None, dx=0.0, pole_x=1.0, pole_z=-0.8, twist=30, curl=0.65, wrist=20):
    """flex = hip flexion (deg), knee = inner knee angle, lean = torso forward lean (deg).
    Hands rest on top of his shoulders / sides of his neck (guy-local), head turned to her left, cheek past his chest."""
    l = lean
    spine = {"pelvis": (-pel_x, 0, 3), "spine_01": (0.30*l, 0, 0), "spine_02": (0.35*l, 0, 0), "spine_03": (0.35*l, 0, 0),
             "neck_01": (-0.5*l - 6, head_roll*0.5, head_yaw*0.3), "head": (-0.4*l - 6, head_roll*0.5, head_yaw*0.7)}
    feet = {"l": {"ball": [0.10, sup_y, 0.012], "pitch": heel_pitch(rise), "yaw": 8, "pole": (0.25, -1, 0.3)}}
    g = {"flex": flex, "knee": knee, "point": point, "aim_x": aim_x}
    if ankle_x is not None: g["ankle_x"] = ankle_x
    if hands is None:
        hz = hand_z - pull
        def w(p): return [-p[0], gm - p[1], p[2]]
        hands = {"l": {"target": w((-hand_x, hand_y, hz)), "pole": (pole_x, -0.2, pole_z), "twist": -twist, "wrist": (0, 0, -wrist)},
                 "r": {"target": w((hand_x, hand_y, hz)), "pole": (-pole_x, -0.2, pole_z), "twist": twist, "wrist": (0, 0, wrist)}}
    return Pose(spine=spine, root=(dx, dy, -0.055 + rise), feet=feet, leg3={"r": g}, hands=hands, fingers={"l": (curl, 0.4), "r": (curl, 0.4)},
                shape=shape or {"effort": 1.0}, guy=guy)

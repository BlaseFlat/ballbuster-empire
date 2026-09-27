import numpy as np, math
from qmath import *
from rig import Rig

D2R = math.pi/180
# armature space: +X = character's left, +Y = backward, -Y = forward, +Z = up
def E(**kw):
    """bone -> (rx,ry,rz) degrees, armature-space delta rotation."""
    d={}
    for k,v in kw.items():
        d[k]=qeuler(v)
    return d

def merge(*ds):
    out={}
    for d in ds:
        for k,v in d.items():
            out[k]=qmul(v,out[k]) if k in out else v
    return out

def sym(prefix, val):
    return {prefix+"_l":val, prefix+"_r":val}

# ---------- shared building blocks ----------
def arm_down(theta_l=(0,0,55), theta_r=(0,0,-55)):
    # bring arms down from T-pose to sides (clavicle/upperarm about Y axis lowers)
    return E(upperarm_l=(0,0,58), upperarm_r=(0,0,-58),
             lowerarm_l=(0,-18,10), lowerarm_r=(0,18,-10))

def relax_hands():
    d={}
    for side in ("l","r"):
        for f in ("index","middle","ring","pinky"):
            for j in ("01","02","03"):
                d[f"{f}_{j}_{side}"]=qeuler((0,0, -22 if side=="l" else 22))
        for j in ("01","02","03"):
            d[f"thumb_{j}_{side}"]=qeuler((0,0,-6 if side=="l" else 6))
    return d

def fist(side, amt=1.0):
    d={}
    for f in ("index","middle","ring","pinky"):
        for j,a in zip(("01","02","03"),(70,80,55)):
            d[f"{f}_{j}_{side}"]=qeuler((0,0,(-a if side=="l" else a)*amt))
    for j,a in zip(("01","02","03"),(20,30,25)):
        d[f"thumb_{j}_{side}"]=qeuler((0,0,(-a if side=="l" else a)*amt))
    return d

class Clip:
    def __init__(self, name, fps=30):
        self.name=name; self.fps=fps; self.keys=[]  # (frame, poseE, root_off, ik, shape, guy_state)
    def key(self, frame, pose=None, root=(0,0,0), ik=None, shape=None, guy=None):
        self.keys.append({"f":frame,"pose":pose or {},"root":list(root),"ik":ik or [],"shape":shape or {},"guy":guy})
        return self
    def dur(self): return max(k["f"] for k in self.keys)

# ---------- RUSANA ----------
def rus_base_stance():
    # slight fighting crouch, bladed
    return merge(
      E(pelvis=(-4,0,6), spine_01=(2,0,-3), spine_02=(3,0,-4), spine_03=(4,0,-2),
        neck_01=(-4,0,2), head=(-3,0,3)),
      # legs: staggered, knees soft-bent, feet apart
      E(thigh_l=(-8,0,10), calf_l=(16,0,0), foot_l=(6,0,0),
        thigh_r=(-14,0,-6), calf_r=(24,0,0), foot_r=(10,0,0)),
      # arms up in guard
      E(clavicle_l=(0,0,-4), upperarm_l=(-18,10,78), lowerarm_l=(-95,-30,10), hand_l=(0,0,10),
        clavicle_r=(0,0,4), upperarm_r=(-30,-10,-92), lowerarm_r=(-110,30,-10), hand_r=(0,0,-10)),
      fist("l",0.85), fist("r",0.9)
    )

RUS_STANCE_ROOT=(0,0,-0.03)

def build_rusana(rigpath):
    R=Rig(rigpath)
    clips=[]
    st=rus_base_stance(); sr=RUS_STANCE_ROOT

    # idle: subtle breathing/bob loop
    c=Clip("rus_idle")
    c.key(0, st, sr, shape={"cold":0.7})
    c.key(20, merge(st,E(spine_02=(1.5,0,0),spine_01=(1,0,0),head=(1,0,0))), (0,0,-0.045), shape={"cold":0.7})
    c.key(38, merge(st,E(spine_03=(0,0,-1),head=(0,0,-1))), (0,0,-0.02), shape={"cold":0.7})
    c.key(60, st, sr, shape={"cold":0.7})
    clips.append(c)

    # walk: 32f cycle
    c=Clip("rus_walk")
    def walk_pose(ph):
        # ph in [0,1)
        sw=math.sin(ph*2*math.pi)
        lift=max(0,math.sin(ph*2*math.pi))
        base=merge(
          E(pelvis=(-2,0,3), spine_01=(2,0,0), spine_02=(3,0,0), spine_03=(2,0,0), neck_01=(-2,0,0),
            upperarm_l=(0,10,72), lowerarm_l=(-55,0,0),
            upperarm_r=(0,-10,-72), lowerarm_r=(-55,0,0)),
          relax_hands())
        step=E(
          thigh_l=(-28*sw,0,4), calf_l=(max(0,40*sw)+10,0,0), foot_l=(-10*sw+8,0,0),
          thigh_r=(28*sw,0,-4), calf_r=(max(0,-40*sw)+10,0,0), foot_r=(10*sw+8,0,0),
          upperarm_l=(26*sw,0,0), upperarm_r=(26*sw,0,0),
          spine_03=(0,0,-3*sw))
        return merge(base,step)
    z0=-0.05
    for i,ph in enumerate(np.linspace(0,1,9)):
        bob=z0-0.02*abs(math.sin(ph*2*math.pi))
        c.key(int(ph*32), walk_pose(ph), (0,0,bob), shape={"cold":0.3})
    clips.append(c)

    # ---- kick_up: 8 keys @ frames 0..? use 3fps mapping -> frames
    # contact target (Rusana armature space): guy groin ~ (0,-0.49,0.86)
    Gy=-0.50; Gz=0.83
    c=Clip("rus_kick_up")
    fr=[0,6,11,15,18,22,28,36]  # 8 keys
    # 1 stance
    c.key(fr[0], st, sr, shape={"effort":0.15,"cold":0.5}, guy="idle")
    # 2 prep: weight onto left(support), slight load back, chamber begin
    prep=merge(st, E(pelvis=(-6,0,8), spine_02=(2,0,0),
                     thigh_l=(-4,0,8), calf_l=(20,0,0),
                     thigh_r=(-40,0,-4), calf_r=(70,0,0), foot_r=(20,0,0)),
                     fist("l",0.9),fist("r",0.9))
    c.key(fr[1], prep, (0,0,-0.05), shape={"effort":0.3}, guy="idle")
    # 3 chamber: knee up ~mid-thigh, shin vertical under knee (deep calf bend)
    cham=merge(st, E(pelvis=(-10,0,10), spine_01=(2,0,0), spine_02=(3,0,0),
                     thigh_l=(-2,0,8), calf_l=(22,0,0), foot_l=(8,0,0),
                     thigh_r=(-78,-4,-6), calf_r=(120,0,0), foot_r=(30,0,0),
                     upperarm_l=(-10,10,74), upperarm_r=(-24,-10,-88)),
                     fist("l",1),fist("r",1))
    c.key(fr[2], cham, (0,0,-0.05), shape={"effort":0.6}, guy="idle")
    # 4 contact (IK foot to groin from below), torso upright/slightly back, hips forward, support knee bent heel lifts
    contact_pose=merge(st, E(pelvis=(-6,0,6), spine_01=(-3,0,0), spine_02=(-4,0,0), spine_03=(-3,0,0),
                     neck_01=(4,0,0), head=(6,0,0),
                     thigh_l=(-6,0,8), calf_l=(30,0,0), foot_l=(-24,0,0),  # support heel lift
                     upperarm_l=(-30,10,70), lowerarm_l=(-80,0,0),
                     upperarm_r=(-40,-10,-80), lowerarm_r=(-70,0,0)),
                     fist("l",1),fist("r",1))
    ik_contact=[{"chain":"r","target":[0.02,Gy,Gz],"pole":[0.05,-1,-0.2]}]
    c.key(fr[3], contact_pose, (0,0.02,-0.02), ik=ik_contact, shape={"effort":1.0}, guy="flinch")
    # 5 contact peak slight higher (his heels lift)
    ik_peak=[{"chain":"r","target":[0.02,Gy+0.03,Gz+0.06],"pole":[0.05,-1,-0.1]}]
    c.key(fr[4], merge(contact_pose,E(pelvis=(-4,0,6),spine_01=(-4,0,0),head=(8,0,0))), (0,0.02,0.0), ik=ik_peak, shape={"effort":1.0}, guy="flinch")
    # 6 follow-through upward
    ik_fol=[{"chain":"r","target":[0.02,Gy+0.05,Gz+0.16],"pole":[0.05,-1,0.0]}]
    c.key(fr[5], merge(st,E(pelvis=(-4,0,6),spine_01=(-5,0,0),spine_02=(-4,0,0),head=(6,0,0),
                     thigh_l=(-8,0,8),calf_l=(34,0,0),foot_l=(-26,0,0),
                     upperarm_l=(-34,10,66),upperarm_r=(-44,-10,-76)),fist("l",1),fist("r",1)),
          (0,0.01,0.0), ik=ik_fol, shape={"effort":0.8}, guy="flinch")
    # 7 knee returns (retract)
    c.key(fr[6], merge(st,E(pelvis=(-8,0,8),thigh_r=(-52,0,-4),calf_r=(90,0,0),foot_r=(24,0,0)),fist("l",0.9),fist("r",0.9)),
          (0,0,-0.04), shape={"effort":0.3}, guy="flinch")
    # 8 stance
    c.key(fr[7], st, sr, shape={"cold":0.5}, guy="double_over")
    clips.append(c)

    # ---- knee: 7 keys, clinch
    c=Clip("rus_knee")
    kf=[0,7,12,15,20,26,34]
    Ky=-0.46; Kz=0.86
    # grab/pull: reach hands to his shoulders, step in
    grab=merge(st, E(pelvis=(-6,0,4), spine_01=(2,0,0), spine_02=(3,0,0),
                     upperarm_l=(-70,20,50), lowerarm_l=(-40,-20,0), hand_l=(0,0,20),
                     upperarm_r=(-80,-20,-48), lowerarm_r=(-40,20,0), hand_r=(0,0,-20),
                     thigh_l=(-6,0,8), calf_l=(20,0,0), thigh_r=(-10,0,-8), calf_r=(24,0,0)))
    c.key(kf[0], grab, (0,-0.02,-0.03), shape={"cold":0.6}, guy="idle")
    # chamber: fold striking leg tightly (heel to glutes), knee begins up centerline
    cham=merge(grab, E(pelvis=(-12,0,6), spine_01=(-2,0,0),
                     thigh_r=(-60,0,0), calf_r=(140,0,0), foot_r=(40,0,0),
                     thigh_l=(-4,0,6), calf_l=(26,0,0), foot_l=(-16,0,0)))
    c.key(kf[1], cham, (0,-0.02,-0.02), shape={"effort":0.5}, guy="idle")
    # contact: knee drives straight up centerline, hips snap forward/up (IK knee target, foot stays folded)
    ik_kn=[{"chain":"r","target":[0.0,Ky+0.16,Kz-0.02],"pole":[0.0,-1,0.2],"knee_target":[0.02,Ky,Kz],"fold":True}]
    contact=merge(grab, E(pelvis=(-2,0,4), spine_01=(-4,0,0), spine_02=(-3,0,0), neck_01=(4,0,0), head=(6,0,0),
                     thigh_r=(-96,0,0), calf_r=(150,0,0), foot_r=(50,0,0),
                     thigh_l=(-6,0,6), calf_l=(34,0,0), foot_l=(-26,0,0),
                     upperarm_l=(-84,20,46), lowerarm_l=(-50,-20,0),
                     upperarm_r=(-92,-20,-44), lowerarm_r=(-50,20,0)))
    c.key(kf[2], contact, (0,0.0,0.02), ik=ik_kn, shape={"effort":1.0}, guy="flinch")
    # peak: his heels lift, knee highest
    contact2=merge(contact, E(pelvis=(0,0,4), thigh_r=(-104,0,0), spine_01=(-5,0,0), head=(8,0,0)))
    c.key(kf[3], contact2, (0,0.0,0.04), ik=[{"chain":"r","target":[0.0,Ky+0.14,Kz+0.05],"pole":[0.0,-1,0.3],"fold":True}], shape={"effort":1.0}, guy="flinch")
    # hold
    c.key(kf[4], contact, (0,0.0,0.02), ik=ik_kn, shape={"effort":0.85}, guy="flinch")
    # return
    c.key(kf[5], merge(grab,E(pelvis=(-10,0,6),thigh_r=(-44,0,0),calf_r=(90,0,0))), (0,-0.02,-0.03), shape={"effort":0.3}, guy="double_over")
    # stance
    c.key(kf[6], st, sr, shape={"smirk":0.4}, guy="double_over")
    clips.append(c)

    # victory: 8 keys - hands on hips, chin up, foot on... just dominant pose + smirk
    c=Clip("rus_victory")
    vf=[0,10,20,30,42,54,66,80]
    v_hips=merge(st, E(pelvis=(-2,0,4), spine_01=(-2,0,0), spine_02=(-3,0,0), neck_01=(4,0,0), head=(6,0,0),
        upperarm_l=(20,30,96), lowerarm_l=(-110,-40,0), hand_l=(0,0,40),
        upperarm_r=(20,-30,-96), lowerarm_r=(-110,40,0), hand_r=(0,0,-40),
        thigh_l=(-4,0,10), calf_l=(14,0,0), thigh_r=(-4,0,-10), calf_r=(14,0,0)))
    c.key(vf[0], st, sr, guy="floor")
    c.key(vf[1], merge(st,E(spine_01=(-4,0,0),head=(4,0,0))), (0,0,-0.02), shape={"smirk":0.6}, guy="floor")
    c.key(vf[2], v_hips, (0,0,-0.01), shape={"smirk":0.9}, guy="tap")
    c.key(vf[3], merge(v_hips,E(head=(6,-6,4),spine_03=(0,0,-3))), (0,0,-0.01), shape={"smirk":1.0}, guy="tap")
    c.key(vf[4], merge(v_hips,E(head=(8,6,4),spine_03=(0,0,3),pelvis=(-2,0,6))), (0,0,-0.02), shape={"smirk":0.9}, guy="tap")
    c.key(vf[5], merge(v_hips,E(head=(6,0,6))), (0,0,-0.01), shape={"smirk":1.0}, guy="tap")
    c.key(vf[6], v_hips, (0,0,-0.01), shape={"smirk":0.95}, guy="tap")
    c.key(vf[7], v_hips, (0,0,-0.01), shape={"smirk":1.0}, guy="tap")
    clips.append(c)

    return R, clips, st, sr

# ---------- GUY ----------
def guy_base():
    # feet shoulder-width+ with gap between thighs, relaxed cocky
    return merge(
      E(pelvis=(-2,0,0), spine_01=(1,0,0), spine_02=(2,0,0), spine_03=(2,0,0), neck_01=(-2,0,0), head=(-2,0,0),
        thigh_l=(-4,0,16), calf_l=(8,0,0), foot_l=(4,0,-6),
        thigh_r=(-4,0,-16), calf_r=(8,0,0), foot_r=(4,0,6),
        clavicle_l=(0,0,-2), upperarm_l=(6,6,68), lowerarm_l=(-30,-10,0),
        clavicle_r=(0,0,2), upperarm_r=(6,-6,-68), lowerarm_r=(-30,10,0)),
      relax_hands())

def hands_to_groin(amt=1.0):
    return E(upperarm_l=(-40*amt,20*amt,20*amt), lowerarm_l=(-95*amt,-30*amt,0), hand_l=(0,0,30*amt),
             upperarm_r=(-40*amt,-20*amt,-20*amt), lowerarm_r=(-95*amt,30*amt,0), hand_r=(0,0,-30*amt))

def build_guy(rigpath):
    R=Rig(rigpath); clips=[]
    gb=guy_base()
    # idle
    c=Clip("guy_idle")
    c.key(0, gb, (0,0,0), shape={"smug":0.5})
    c.key(24, merge(gb,E(spine_02=(1,0,0),head=(1,0,-1))), (0,0,-0.015), shape={"smug":0.5})
    c.key(48, gb, (0,0,0), shape={"smug":0.5})
    clips.append(c)
    # flinch: hips back, knees in, hands to groin (4)
    c=Clip("guy_flinch")
    fl=merge(gb, E(pelvis=(6,0,0), spine_01=(8,0,0), spine_02=(10,0,0), spine_03=(8,0,0), neck_01=(6,0,0), head=(10,0,0),
                   thigh_l=(-16,0,-4), calf_l=(28,0,0), thigh_r=(-16,0,4), calf_r=(28,0,0)),
                   hands_to_groin(1.0))
    c.key(0, gb, (0,0,0), shape={"shock":0.3})
    c.key(3, merge(gb,E(spine_02=(4,0,0),head=(4,0,0)),hands_to_groin(0.5)), (0,0.02,-0.02), shape={"shock":0.9})
    c.key(7, fl, (0,0.04,-0.06), shape={"pain":1.0})
    c.key(11, merge(fl,E(spine_02=(12,0,0),head=(12,0,0))), (0,0.05,-0.08), shape={"pain":1.0})
    clips.append(c)
    # double_over (6)
    c=Clip("guy_double_over")
    dv=merge(gb, E(pelvis=(10,0,0), spine_01=(20,0,0), spine_02=(26,0,0), spine_03=(20,0,0), neck_01=(10,0,0), head=(-6,0,0),
                   thigh_l=(-30,0,-6), calf_l=(46,0,0), foot_l=(10,0,0), thigh_r=(-30,0,6), calf_r=(46,0,0), foot_r=(10,0,0)),
                   hands_to_groin(1.1))
    for i,f in enumerate([0,6,12,18,24,30]):
        t=i/5
        c.key(f, merge(gb, {k:slerp(gb.get(k,QI),v,min(1,t*1.3)) for k,v in dv.items()}), (0,0.06*t,-0.12*t), shape={"pain":min(1,0.6+t)})
    clips.append(c)
    # knees (6): sinks to knees
    c=Clip("guy_knees")
    kn=merge(gb, E(pelvis=(18,0,0), spine_01=(24,0,0), spine_02=(30,0,0), spine_03=(22,0,0), head=(-4,0,0),
                   thigh_l=(-96,0,-6), calf_l=(140,0,0), foot_l=(30,0,0),
                   thigh_r=(-96,0,6), calf_r=(140,0,0), foot_r=(30,0,0)),
                   hands_to_groin(1.15))
    for i,f in enumerate([0,6,12,18,24,30]):
        t=i/5
        c.key(f, merge(gb,{k:slerp(gb.get(k,QI),v,t) for k,v in kn.items()}), (0,0.02, -0.42*t), shape={"pain":1.0,"agony":0.4*t})
    clips.append(c)
    # floor (hold): lying curled on side, hands to groin
    c=Clip("guy_floor")
    fL=merge(E(pelvis=(4,-60,0), spine_01=(16,0,0), spine_02=(20,0,0), spine_03=(16,0,0), neck_01=(8,0,0), head=(10,0,0),
               thigh_l=(-110,0,-8), calf_l=(150,0,0), foot_l=(30,0,0),
               thigh_r=(-120,0,8), calf_r=(150,0,0), foot_r=(30,0,0),
               upperarm_l=(-50,20,30), lowerarm_l=(-110,-30,0), upperarm_r=(-50,-20,-30), lowerarm_r=(-110,30,0)),
               hands_to_groin(0.6))
    # root: drop to floor and lie; pelvis approx height 0.97 -> lie on side ~0.18
    c.key(0, fL, (0,0.05,-0.80), shape={"agony":1.0})
    c.key(20, merge(fL,E(spine_02=(24,0,0),head=(14,0,0),calf_l=(158,0,0))), (0,0.06,-0.82), shape={"agony":1.0})
    c.key(44, fL, (0,0.05,-0.80), shape={"agony":0.9})
    clips.append(c)
    # tap (6): lying, one hand slaps ground
    c=Clip("guy_tap")
    base=merge(fL,{})
    c.key(0, base, (0,0.05,-0.80), shape={"agony":1.0})
    tapd=merge(fL, E(upperarm_l=(-20,40,60), lowerarm_l=(-40,-20,0), hand_l=(0,0,0)))
    c.key(8, tapd, (0,0.05,-0.80), shape={"agony":0.9})
    c.key(14, merge(fL,E(upperarm_l=(-30,40,50))), (0,0.05,-0.80), shape={"agony":1.0})
    c.key(20, tapd, (0,0.05,-0.80), shape={"agony":0.9})
    c.key(26, merge(fL,E(upperarm_l=(-30,40,50))), (0,0.05,-0.80), shape={"agony":1.0})
    c.key(34, base, (0,0.05,-0.80), shape={"agony":1.0})
    clips.append(c)
    return R, clips, gb, (0,0,0)

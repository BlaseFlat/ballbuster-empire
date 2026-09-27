import numpy as np, math
def q(w,x,y,z): return np.array([w,x,y,z],float)
QI = q(1,0,0,0)
def qmul(a,b):
    w1,x1,y1,z1=a; w2,x2,y2,z2=b
    return np.array([w1*w2-x1*x2-y1*y2-z1*z2, w1*x2+x1*w2+y1*z2-z1*y2, w1*y2-x1*z2+y1*w2+z1*x2, w1*z2+x1*y2-y1*x2+z1*w2])
def qconj(a): return np.array([a[0],-a[1],-a[2],-a[3]])
def qnorm(a): return a/np.linalg.norm(a)
def qrot(a,v):
    p=np.array([0,*v]); return qmul(qmul(a,p),qconj(a))[1:]
def qaxis(axis,deg):
    axis=np.asarray(axis,float); axis=axis/np.linalg.norm(axis); h=math.radians(deg)/2
    return np.array([math.cos(h),*(axis*math.sin(h))])
def qeuler(e):
    # e = (x,y,z) degrees, applied X then Y then Z (extrinsic) => R = Rz Ry Rx
    x,y,z=e
    return qmul(qaxis((0,0,1),z), qmul(qaxis((0,1,0),y), qaxis((1,0,0),x)))
def qbetween(u,v):
    u=np.asarray(u,float)/np.linalg.norm(u); v=np.asarray(v,float)/np.linalg.norm(v)
    d=np.dot(u,v)
    if d<-0.999999:
        ax=np.cross([1,0,0],u)
        if np.linalg.norm(ax)<1e-6: ax=np.cross([0,1,0],u)
        return qaxis(ax,180)
    c=np.cross(u,v); w=1+d
    return qnorm(np.array([w,*c]))
def mat_to_q(m):
    t=m[0,0]+m[1,1]+m[2,2]
    if t>0:
        s=math.sqrt(t+1)*2; return qnorm(np.array([0.25*s,(m[2,1]-m[1,2])/s,(m[0,2]-m[2,0])/s,(m[1,0]-m[0,1])/s]))
    if m[0,0]>m[1,1] and m[0,0]>m[2,2]:
        s=math.sqrt(1+m[0,0]-m[1,1]-m[2,2])*2; return qnorm(np.array([(m[2,1]-m[1,2])/s,0.25*s,(m[0,1]+m[1,0])/s,(m[0,2]+m[2,0])/s]))
    if m[1,1]>m[2,2]:
        s=math.sqrt(1+m[1,1]-m[0,0]-m[2,2])*2; return qnorm(np.array([(m[0,2]-m[2,0])/s,(m[0,1]+m[1,0])/s,0.25*s,(m[1,2]+m[2,1])/s]))
    s=math.sqrt(1+m[2,2]-m[0,0]-m[1,1])*2; return qnorm(np.array([(m[1,0]-m[0,1])/s,(m[0,2]+m[2,0])/s,(m[1,2]+m[2,1])/s,0.25*s]))
def frame_q(a1,b1,a2,b2):
    def fr(a,b):
        a=np.asarray(a,float); a=a/np.linalg.norm(a)
        b=np.asarray(b,float); b=b-a*np.dot(a,b); b=b/np.linalg.norm(b)
        return np.column_stack([a,b,np.cross(a,b)])
    M=fr(a2,b2)@fr(a1,b1).T
    return mat_to_q(M)
def slerp(a,b,t):
    d=np.dot(a,b)
    if d<0: b=-b; d=-d
    if d>0.9995: return qnorm(a+(b-a)*t)
    th=math.acos(d); s=math.sin(th)
    return (math.sin((1-t)*th)*a+math.sin(t*th)*b)/s

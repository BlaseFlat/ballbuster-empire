import numpy as np
from PIL import Image, ImageFilter
rng = np.random.default_rng(7)
OUT='/workspace/bb3d/tex/'
# --- hair strand card: 256 wide x 1024 tall; root at top (v=1), tip at bottom
W,H=256,1024
col=np.zeros((H,W,3),np.float32); alpha=np.zeros((H,W),np.float32)
base=np.array([0.17,0.10,0.06])
for i in range(900):
    x0=rng.uniform(8,W-8); w=rng.uniform(0.6,1.8)
    L=rng.uniform(0.55,1.0)*H
    drift=rng.normal(0,6)
    b=rng.uniform(0.55,1.6)
    ys=np.arange(int(L))
    xs=x0+drift*(ys/H)**1.5+np.sin(ys/rng.uniform(40,120)+rng.uniform(0,6))*rng.uniform(0,2)
    for y,x in zip(ys,xs):
        xi=int(x)
        if 0<=xi<W-1:
            fade=1.0-(y/L)**3
            a=0.85*fade
            alpha[y,xi]=max(alpha[y,xi],a); alpha[y,xi+1]=max(alpha[y,xi+1],a*0.5)
            c=base*b*(1+0.35*np.sin(y*0.02+i))
            col[y,xi]=np.maximum(col[y,xi],c); col[y,xi+1]=np.maximum(col[y,xi+1],c*0.8)
# edge falloff horizontally
xx=np.linspace(0,1,W); edge=np.clip(np.minimum(xx,1-xx)*6,0,1)
alpha*=edge[None,:]
# fill base underlayer near root to avoid see-through at root
root=np.clip(1-np.linspace(0,1,H)*2.5,0,1)[:,None]*edge[None,:]
alpha=np.maximum(alpha,root*0.9)
col=np.where(col.sum(2,keepdims=True)>0,col,base*0.8)
# highlight band (anisotropic sheen fake)
img=np.dstack([np.clip(col,0,1),alpha[...,None]])
im=Image.fromarray((img*255).astype(np.uint8),'RGBA').filter(ImageFilter.GaussianBlur(0.5))
im.save(OUT+'hair_strands.png')
# --- fabric normal map (tileable knit), 512
N=512
u=np.linspace(0,2*np.pi*48,N,endpoint=False)
U,V=np.meshgrid(u,u)
h=0.5*np.sin(U)*np.sin(V*0.5)**2+0.25*np.sin(V)+0.08*rng.normal(size=(N,N))
from numpy.fft import fft2, ifft2
# derivative
dx=np.roll(h,-1,1)-np.roll(h,1,1); dy=np.roll(h,-1,0)-np.roll(h,1,0)
s=0.6
n=np.dstack([-dx*s,-dy*s,np.ones_like(h)]); n/=np.linalg.norm(n,axis=2,keepdims=True)
Image.fromarray(((n*0.5+0.5)*255).astype(np.uint8)).save(OUT+'fabric_normal.png')
print("ok")

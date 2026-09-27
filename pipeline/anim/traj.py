import numpy as np, json, clips as CL, author2 as A2
Rg,gc=CL.build_guy('../out/guy_rig.json'); Rr,rc=CL.build_rusana('../out/rusana_rig.json')
G={c.name:A2.run(Rg,c)[0] for c in gc}; Rf={c.name:A2.run(Rr,c)[0] for c in rc}
N=json.load(open('strike_params.json'))['knee']; m=N['guy_m']; cf=N['contact_f']
def gh(nm,f,b='head'):
    E,r,_=G[nm][min(f,len(G[nm])-1)]; D,H=Rg.fk(E,r); p=H[b]; return np.array([-p[0],m-p[1],p[2]])
def rh(f,b='head'):
    E,r,_=Rf['rus_knee'][min(f,len(Rf['rus_knee'])-1)]; D,H=Rr.fk(E,r); return H[b]
for f in range(10,31):
    if f<cf: nm,ff='guy_clinched',f
    elif f<cf+12: nm,ff='guy_flinch_knee',f-cf
    else: nm,ff='guy_double_over',f-cf-12
    g=gh(nm,ff); r=rh(f); gs=gh(nm,ff,'spine_03'); rs=rh(f,'spine_03')
    print(f,nm,ff,'his head y/z',np.round(g[1:],3),'her head y/z',np.round(r[1:],3),'dy',round(r[1]-g[1],3),'| chest his',np.round(gs[1:],3),'hers',np.round(rs[1:],3))

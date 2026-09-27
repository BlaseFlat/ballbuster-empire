import numpy as np, soundfile as sf, glob, json, sys
def f0(x,sr):
    # autocorrelation F0 on frames, 70-400 Hz, voiced if peak>0.35
    fr=int(0.04*sr); hop=int(0.02*sr); out=[]
    for i in range(0,len(x)-fr,hop):
        w=x[i:i+fr]*np.hanning(fr)
        if np.sqrt(np.mean(w**2))<0.01: continue
        ac=np.fft.irfft(np.abs(np.fft.rfft(w,2*fr))**2)[:fr]; ac/=ac[0]+1e-9
        lo,hi=int(sr/400),int(sr/70); k=lo+np.argmax(ac[lo:hi])
        if ac[k]>0.4: out.append(sr/k)
    return out
res={}
for p in sorted(glob.glob('wav/*.wav')):
    x,sr=sf.read(p); x=x/ (np.max(np.abs(x))+1e-9)
    hop=int(0.01*sr); env=np.array([np.sqrt(np.mean(x[i:i+hop]**2)) for i in range(0,len(x)-hop,hop)])
    thr=max(0.02, 0.06*env.max())
    on=env>thr; segs=[]; i=0
    while i<len(on):
        if on[i]:
            j=i
            while j<len(on) and (on[j] or np.any(on[j:j+18])): j+=1
            if j-i>=8: segs.append((i/100,j/100))
            i=j
        else: i+=1
    info=[]
    for a,b in segs:
        s=x[int(a*sr):int(b*sr)]; F=f0(s,sr); vr=len(F)/max(1,(b-a)/0.02)
        info.append(dict(a=round(a,2),b=round(b,2),pk=round(float(20*np.log10(np.max(np.abs(s))+1e-9)),1),rms=round(float(20*np.log10(np.sqrt(np.mean(s**2))+1e-9)),1),f0=round(float(np.median(F)),0) if F else 0,voiced=round(vr,2)))
    res[p[4:-4]]=dict(dur=round(len(x)/sr,2),segs=info)
    print(p[4:-4], res[p[4:-4]]['dur'], ' | '.join(f"{s['a']}-{s['b']} f0={s['f0']:.0f} v={s['voiced']} rms={s['rms']}" for s in info[:14]))
json.dump(res,open('analysis.json','w'),indent=1)

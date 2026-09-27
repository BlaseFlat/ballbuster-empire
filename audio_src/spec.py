import numpy as np, soundfile as sf, matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
from segs import SEGS
rows=len(SEGS); cols=max(len(v) for v in SEGS.values())
fig,ax=plt.subplots(rows,cols,figsize=(cols*2.6,rows*1.9))
for r,(cat,lst) in enumerate(SEGS.items()):
    for c in range(cols):
        a=ax[r][c]; a.set_xticks([]); a.set_yticks([])
        if c>=len(lst): a.axis('off'); continue
        sid,t0,t1=lst[c]; x,sr=sf.read(f'wav/{sid}.wav'); s=x[int(t0*sr):int(t1*sr)]
        a.specgram(s,NFFT=1024,Fs=sr,noverlap=768,cmap='magma',vmin=-120); a.set_ylim(0,5000)
        a.set_title(f'{cat} {sid} {t1-t0:.2f}s',fontsize=7)
plt.tight_layout(); plt.savefig('spec.png',dpi=70)

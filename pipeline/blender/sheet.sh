#!/bin/bash
# usage: sheet.sh blend outprefix
B=/workspace/tools/blender/blender-4.2.23-linux-x64/blender
$B -b $1 --python /workspace/bb3d/blender/preview.py -- $2 front,side,q,back,face 2>&1 | grep -E "Error"
python3 -c "
from PIL import Image
ims=[Image.open(f'$2_{v}.png') for v in ['front','side','q','back','face']]
ims=[i.crop((100,50,500,850)) if k<4 else i.crop((0,100,600,800)).resize((400,466)) for k,i in enumerate(ims)]
W=sum(i.width for i in ims); H=max(i.height for i in ims)
o=Image.new('RGB',(W,H)); x=0
for i in ims: o.paste(i,(x,0)); x+=i.width
o.save('$2_sheet.png')"

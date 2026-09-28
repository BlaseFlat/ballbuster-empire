#!/bin/bash
# Build all character .blend files (MPFB). Skeletons are locked to blender/rig_ref/*_rig.json,
# so out/*_rig.json (animation input) stays unchanged; rigdump is only used for verification.
set -e
B=/workspace/tools/blender/blender-4.2.23-linux-x64/blender
cd /workspace/bb3d
for c in rusana guy guy_b guy_c; do
  $B -b --python blender/pipeline.py -- blender/$c.json > /tmp/build_$c.log 2>&1
  if grep -q Traceback /tmp/build_$c.log; then grep -A20 Traceback /tmp/build_$c.log; exit 1; fi
  grep -E "SAVED|RIGLOCK /" /tmp/build_$c.log
  $B -b out/$c.blend --python blender/rigdump.py -- /tmp/${c}_rig_check.json >/dev/null 2>&1
  r=$c; [[ $c == guy* ]] && r=guy
  python3 -c "
import json,numpy as np
a=json.load(open('blender/rig_ref/${r}_rig.json'));b=json.load(open('/tmp/${c}_rig_check.json'))
assert set(a)==set(b), 'bone set differs'
d=max(max(np.abs(np.array(a[k][f])-np.array(b[k][f])).max() for f in ('head','tail','rest_q')) for k in a)
print('RIGCHECK $c bones',len(b),'max dev %.2e'%d); assert d<1e-4"
done

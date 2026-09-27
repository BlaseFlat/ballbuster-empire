#!/bin/bash
set -e
B=/workspace/tools/blender/blender-4.2.23-linux-x64/blender
cd /workspace/bb3d
for c in rusana guy; do
  $B -b --python blender/export_glb.py -- out/${c}_anim.blend out/$c.glb out/${c}_masks.json 2>&1 | grep -E "EXPORTED|Error" || true
  if [ $c = rusana ]; then J=out/rus_anim.json; P=""; else J=out/guy_anim.json; P="guy_"; fi
  node tools/post.mjs out/$c.glb /tmp/$c.p.glb $J $P
  npx gltf-transform webp /tmp/$c.p.glb /tmp/$c.c.glb --quality 88 >/dev/null 2>&1
  npx gltf-transform meshopt /tmp/$c.c.glb opt/$c.glb --level medium >/dev/null 2>&1
  ls -la opt/$c.glb
done

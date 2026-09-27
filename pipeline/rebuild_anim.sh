#!/bin/bash
set -e
B=/workspace/tools/blender/blender-4.2.23-linux-x64/blender
cd /workspace/bb3d/anim && python3 author2.py
cd /workspace/bb3d/blender
$B -b --python bake.py -- /workspace/bb3d/out/rusana.blend /workspace/bb3d/out/rus_anim.json /workspace/bb3d/out/rusana_anim.blend 2>&1|grep BAKED
$B -b --python bake.py -- /workspace/bb3d/out/guy.blend /workspace/bb3d/out/guy_anim.json /workspace/bb3d/out/guy_anim.blend 2>&1|grep BAKED

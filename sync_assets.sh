#!/usr/bin/env bash
# Copy the character GLBs (+ CONTACT.json / anim_meta.json if present) from the character
# pipeline into the site, write assets/models/manifest.json and bump the cache-bust version.
#
#   ./sync_assets.sh            # sync only
#   ./sync_assets.sh --deploy   # sync, then commit + push to GitHub Pages (deploy.sh)
#
# Env overrides: BB_SRC (default /workspace/bb3d/opt), BB_META (default /workspace/bb3d/out/anim_meta.json)
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="${BB_SRC:-/workspace/bb3d/opt}"
META="${BB_META:-/workspace/bb3d/out/anim_meta.json}"
DST="$HERE/assets/models"
mkdir -p "$DST"

for f in rusana.glb guy.glb; do
  [ -f "$SRC/$f" ] || { echo "ERROR: missing $SRC/$f" >&2; exit 1; }
  cp -v "$SRC/$f" "$DST/$f"
done
# optional guy body variants (same rig + clips as guy.glb); config.js GUYS[].model picks one per NPC
for f in guy_b.glb guy_c.glb; do
  if [ -f "$SRC/$f" ]; then cp -v "$SRC/$f" "$DST/$f"; else rm -f "$DST/$f"; fi
done
HAS_CONTACT=false; HAS_META=false
if [ -f "$SRC/CONTACT.json" ]; then cp -v "$SRC/CONTACT.json" "$DST/CONTACT.json"; HAS_CONTACT=true; else rm -f "$DST/CONTACT.json"; fi
if [ -f "$SRC/anim_meta.json" ]; then cp -v "$SRC/anim_meta.json" "$DST/anim_meta.json"; HAS_META=true
elif [ -f "$META" ]; then cp -v "$META" "$DST/anim_meta.json"; HAS_META=true; fi

OLD="$(cat "$HERE/VERSION" 2>/dev/null || echo 1)"
NEW=$((OLD + 1))
echo "$NEW" > "$HERE/VERSION"
sed -i -E "s/\?v=[0-9]+/?v=$NEW/g; s/(name=\"bb-version\" content=\")[0-9]+/\1$NEW/" "$HERE/index.html"

# manifest (clip lists read straight from the GLB JSON chunk; no deps)
node - "$DST" "$NEW" "$HAS_CONTACT" "$HAS_META" <<'JS'
const fs = require('fs'), path = require('path');
const [dst, ver, hasC, hasM] = process.argv.slice(2);
const clips = (f) => { const b = fs.readFileSync(path.join(dst, f)); const n = b.readUInt32LE(12); const j = JSON.parse(b.slice(20, 20 + n)); return (j.animations || []).map((a) => a.name); };
const m = { version: +ver, synced: new Date().toISOString(), contact: hasC === 'true', meta: hasM === 'true',
  rusana: { bytes: fs.statSync(path.join(dst, 'rusana.glb')).size, clips: clips('rusana.glb') },
  guy: { bytes: fs.statSync(path.join(dst, 'guy.glb')).size, clips: clips('guy.glb') }, variants: {} };
for (const v of ['guy_b', 'guy_c']) if (fs.existsSync(path.join(dst, v + '.glb'))) {
  m.variants[v] = { bytes: fs.statSync(path.join(dst, v + '.glb')).size, clips: clips(v + '.glb') };
  const miss = m.guy.clips.filter((c) => !m.variants[v].clips.includes(c));
  console.log(`${v}: ${m.variants[v].clips.length} clips` + (miss.length ? `  MISSING vs guy: ${miss.join(', ')}` : '  OK (same clips as guy)'));
}
fs.writeFileSync(path.join(dst, 'manifest.json'), JSON.stringify(m, null, 2));
const need = { rusana: ['rus_idle', 'rus_walk', 'rus_kick_up', 'rus_knee', 'rus_victory'], guy: ['idle', 'flinch', 'double_over', 'knees', 'floor', 'tap'] };
for (const k of ['rusana', 'guy']) {
  const have = m[k].clips.map((c) => c.replace(/^guy_/, ''));
  const miss = need[k].filter((c) => !have.includes(c));
  console.log(`${k}: ${m[k].clips.length} clips [${m[k].clips.join(', ')}]` + (miss.length ? `  MISSING: ${miss.join(', ')} (game falls back to idle)` : '  OK'));
}
console.log(`CONTACT.json: ${m.contact ? 'yes' : 'no (using anim_meta / fallback placement)'}`);
JS
echo "cache-bust version: $OLD -> $NEW"
if [ "${1:-}" = "--deploy" ]; then "$HERE/deploy.sh" "Sync character assets (v$NEW)"; fi

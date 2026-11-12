# Zamboni model and prototype (Blender + Three.js)

The intermission / pregame ice preparation is a Three.js scene (`src/lib/ice3d.ts`) driven by one route and one countdown timeline (`src/lib/ice-plan.mjs`).
The vehicle is a GLB built here with Blender's Python API.

## What you need
| Tool | Why | How it was provided |
| --- | --- | --- |
| Blender 4.2 LTS (headless, Linux x64, ~350 MB) | builds the model from `build_zamboni.py` | downloaded from download.blender.org into a scratch folder (`blender -b -P ...`); no install, no root. The `bpy` pip wheel is the alternative (Python 3.11 only). |
| Python + Pillow | draws the sharp decal textures (`make_textures.py`) | already present |
| `@gltf-transform/cli` (+ `sharp`) | optimises the GLB: meshopt geometry, WebP textures | `npm i` in a scratch folder (not a project dependency) |
| `three` | the renderer | project dependency |
| Meshy image-to-3D (optional) | a first-draft mesh from the reference picture | needs an API key for api.meshy.ai (none is configured here, so it was not used; the model is hand-built in Blender instead) |

## Rebuild the model
```
python3 tools/zamboni/make_textures.py /tmp/zam/tex
blender -b -P tools/zamboni/build_zamboni.py -- /tmp/zam/tex /tmp/zam/zamboni_raw.glb [--preview /tmp/zam/prev]
npx gltf-transform optimize /tmp/zam/zamboni_raw.glb public/models/zamboni.glb --join false --compress meshopt --texture-compress webp --texture-size 2048
```
Units are feet (1 Blender unit = 1 ft = 1 scene unit). The KC Scouts logo and BRING HOCKEY TO KC exist only as decals on this model.
Gotcha fixed along the way: every mesh joined into one object must share the same UV layer name, or the join collapses the decals' UVs.

## Prototype
`prototype/` is a stand-alone page (not in the app bundle): a short straight pass, one U-turn and the departure through the gate.
```
pnpm exec vite build --config tools/zamboni/prototype/vite.config.ts   # -> /tmp/zam/proto-dist
(cd /tmp/zam/proto-dist && python3 -m http.server 4999) &
node tools/zamboni/prototype/capture.mjs <outDir> <name> "<query>" <t0> <t1> <fps>   # frames
node tools/zamboni/prototype/profile.mjs                                             # frame cost
```

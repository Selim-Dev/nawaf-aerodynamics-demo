# Source models (not shipped)

Original downloads go here. This folder is git-ignored except for this note.

Candidate free A320 models on Sketchfab. All are CC BY, which allows commercial use with visible credit. Downloading needs a free Sketchfab account; choose the **glTF / GLB** format.

| Priority | Model | Size | Link |
|---|---|---|---|
| 1 | "a320 200 with cockpit (plain)" by TonyWony | 51k faces, ~4 MB, no airline livery | https://sketchfab.com/3d-models/09d408791ef444158166d017a46f1aa1 |
| 2 | "Airbus A320" by Andre11230 | 127k faces, ~4 MB | https://sketchfab.com/3d-models/790a19f65d5646539ed975c96fedb313 |
| 3 | "Airbus A320-200" by fDlruosne | 738k faces, ~24 MB, 60 materials | https://sketchfab.com/3d-models/02470bf974e645f78f5d9385a333e9e0 |

The third model probably has the best part separation, but it needs simplifying (`--ratio 0.2`).

Avoid models with airline liveries, and any model marked CC BY-NC (non-commercial).

Check each model's licence on its page before use: authors can change it.

## In use

The third model, "Airbus A320-200" by fDlruosne, is the one in the app.

- Source: `airbus-a320-200/` (the downloaded archive, unpacked).
- Shipped file: `public/aircraft/a320/model.glb`, made with `npm run optimize-model -- assets-src/airbus-a320-200/a320-source.glb public/aircraft/a320/model.glb --ratio 0.3` (738k triangles down to 228k, 20 MB down to 1.5 MB).
- Objects with no material in the source file are given a plain light-grey paint at load time (`unpaintedMaterial` in `src/scene/materials.ts`).

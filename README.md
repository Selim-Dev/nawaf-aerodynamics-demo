# Aircraft Explorer 3D (demo)

An interactive 3D aircraft for a training website. Learners can rotate and zoom the aircraft, hover or tap a part to see its name, and click it for an explanation. They can also switch to a see-through **Systems** view that shows the hydraulic, fuel and electrical systems inside. The interface and all content are in English and Arabic.

It opens on a title screen with the aircraft's name and the name of the person the demo is presented to. The aircraft stands in a lit studio (or on a daylight apron) with calm background music and soft interface sounds, all generated in the browser.

This is a proof of concept with one aircraft (A320). The exterior is "Airbus A320-200" by fDlruosne from Sketchfab (CC BY 4.0, credited in the app). A procedural placeholder built in code is kept as a fallback.

## What is real and what is simplified

- **Real:** the overall dimensions, ground clearances, door, cargo hold and landing gear positions, cabin layout, tank and hold volumes, and the position of every ground service point. They come from Airbus's public document *A320 Aircraft Characteristics - Airport and Maintenance Planning* (rev. Jul 01/26) and the Airbus A320ceo key-figures page. The app lists both under "Data sources".
- **Third-party model:** the exterior shape. Scaled to the Airbus figures it matches them closely: 37.6 m long, nose gear 5.1 m aft of the nose, engines 5.75 m from the centreline. This model has wingtip fences, not sharklets.
- **Simplified:** the routing of pipes, ducts and cables. Component positions inside the aircraft are approximate.
- **Not used:** nothing is copied from PAFAERO, Airbus ACT or Lufthansa LEVO. Those are licensed products.

## The Systems view

| System | What it shows |
|---|---|
| Cabin and compartments | Cockpit, 180 seats, bins, galleys, lavatories, the three cargo holds with containers, avionics and gear bays, wing centre box, pressure bulkheads, water and waste tanks, APU |
| Hydraulic | Green, Blue and Yellow circuits: pumps, reservoirs, PTU, RAT, actuators, ground service panels |
| Fuel | Tanks, pumps, valves, feed and transfer lines, refuel coupling and panel |
| Electrical | Generators, external power, batteries, TRs, feeders |
| Air conditioning and pneumatics | Bleed valves and ducts, precoolers, packs, mixing unit, cabin and cockpit ducts, outflow and safety valves, wing anti-ice |
| Flight controls | Every control surface, the ELAC / SEC / FAC computers, signal wiring, slat and flap drives, mechanical backup |
| Ground servicing points | The eleven service points at their published positions |

The **Frames** button shows faint fuselage frames and stringers for context. **Cutaway: Top** opens the cabin from above; **Side** removes the left half of the skin.

## Run it

Requires Node 20.19+ (tested on Node 24).

```
npm install
npm run dev        # http://localhost:5173 (also on the LAN, for testing on a phone)
npm run build      # validates the data, typechecks, writes dist/
npm run preview    # serves dist/
```

Useful URL options:

| URL option | Effect |
|---|---|
| `?lang=ar` / `?lang=en` | Start in Arabic or English |
| `?level=systems&system=fuel` | Open the Systems view on a given system |
| `?for=Name` / `?for=none` | Show another name on the opening screen and the toolbar badge, or no name |
| `?intro=0` | Skip the opening screen |
| `?backdrop=daylight` | Start with the daylight backdrop instead of the studio |
| `?sound=0` | Start with the sound off |
| `?debug=parts` | Paint each part its own colour, to check how the model was split |
| `?debug=meshes` | Paint each object of the source model its own colour, to work out a mapping |
| `?author=1` | Authoring tools (dev server only, never in the build) |

The `debug` and `author` options also skip the opening screen.

## Presenting the demo

**The dedication.** The opening screen reads "A private preview prepared for Eng. Nawaf" (in Arabic: "عرض خاص مُقدَّم إلى المهندس نواف"), and a gold badge in the toolbar keeps the name on screen. To present to someone else, change `CLIENT` in `src/presentation.ts`, or add `?for=Name` to the link. Set `CLIENT` to `null` to remove the dedication everywhere.

**Before the meeting.** Open the page once on the presenting computer so the model is cached, check the sound level, and press **F** for full screen. On the opening screen, press **Start exploring** (or Enter): the music starts and the camera glides out to the full view.

**During the demo**

| Key | Does |
|---|---|
| Esc | Close the part details |
| → / ← | Next / previous part (in Arabic the arrows follow the reading direction) |
| R | Reset the view |
| H | Show or hide the hotspot dots |
| M | Sound on or off |
| F | Full screen |

- The small tabs on the edges of the 3D view fold the parts list and the details column away, for a bigger view on a projector.
- The sun / moon button switches the backdrop between the dark studio and daylight. The Systems view always uses its own dark backdrop, which the see-through skin needs.
- The search box above the parts list finds parts in either language.

## Sound

The music and the interface sounds are synthesised with the Web Audio API (`src/audio/engine.ts`), so there are no audio files to download and it works offline. The music is a slow, unobtrusive ambient piece in C major that never repeats exactly; the interface sounds are tuned to the same key. Browsers only allow sound after a click, so it starts with the Start button (or the first click when the opening screen is skipped).

- The toolbar button turns all sound on or off; the arrow beside it opens separate volume sliders for music and effects. The choice is remembered in the browser.
- Sound pauses while the tab is hidden and costs nothing while off.
- **Using a music track instead:** put the file in `public/audio/` and set `MUSIC_FILE` in `src/presentation.ts` (for example `'audio/ambient.mp3'`). Use a track you have the rights to; it loops.
- **Checking the levels (developers):** on the dev server, `await __renderAudio(60)` in the browser console renders 60 seconds of music offline into an `AudioBuffer`. At the default slider positions the music measures about −22 LUFS and the interface sounds peak about 4 dB above it.

## Hosting and embedding

`dist/` is a static site with relative paths. Upload it to any folder on any web host and embed it with an iframe:

```html
<iframe src="https://example.com/aircraft/index.html?lang=ar" style="width:100%;height:720px;border:0" allow="fullscreen"></iframe>
```

- **Phones:** inside an iframe, the opening screen (or, with `?intro=0`, a "Tap to explore in 3D" button) lets vertical swipes through, so the page can still be scrolled past the viewer. `dist/embed-test.html` demonstrates this.
- **Offline use:** nothing loads from third-party servers. The fonts are bundled, the sky, floor and reflections are generated, and so is the sound.
- **Full screen** needs `allow="fullscreen"` on the iframe; without it the full-screen button is hidden.

## Deploying to Vercel

The project is set up for Vercel:

- `vercel.json` sets the build (`npm run build`, which checks the data first) and the output folder (`dist/`). It also lets browsers keep the fingerprinted files in `assets/` for a year.
- `.vercelignore` leaves `assets-src/` (about 50 MB of original downloads) and other unneeded folders out of the upload, which is about 2 MB.
- `package.json` asks for Node 24. The data check runs a TypeScript file directly, which needs Node 22.18 or newer.

From the project folder:

```
npx vercel login           # once: opens the browser to sign in to your Vercel account
npx vercel --prod          # builds on Vercel and prints the public address
```

The first run creates a Vercel project named after the folder. Run `npx vercel --prod` again to publish changes to the same address.

- Use the production address (`--prod`) to share. Vercel puts a Vercel login in front of preview addresses, so a client could not open them.
- Anyone with the production address can open the page. It is not listed or linked anywhere, but it has no password.

## Where things are

```
src/data/aircraft/a320/
  aircraft.json   model file, its scale/rotation, default camera, wing/tail geometry, credits
  parts.json      the learner-facing content: one record per part, English + Arabic
  mapping.json    which piece of the 3D model is which part
  systems.json    categories, plus the internal systems (components and pipe routes)
src/data/schema.ts              the rules every data file must follow
scripts/validate.ts             checks the data files (runs before every build)
src/presentation.ts             who the demo is presented to, and an optional music file
src/scene/classifyParts.ts      splits any model into one mesh per part
src/scene/PlaceholderAircraft.ts the procedural airliner
src/scene/SystemsLayer.tsx      draws systems from systems.json
src/scene/Backdrop.tsx          sky, floor, floor lettering and lights; moods.ts holds their colours
src/scene/GroundShadow.tsx      the soft shadow under the aircraft (drawn once, when the model loads)
src/audio/                      generated music and interface sounds, and the sound settings
src/ui/                         toolbar, parts list, details panel, opening screen, nameplate
src/authoring/                  dev-only tools for placing volumes and pipe routes
```

## Editing content

All text lives in `parts.json`. Each part looks like this:

```json
{
  "id": "rudder",
  "kind": "exterior",
  "system": "flight-controls",
  "name":    { "en": "Rudder", "ar": "الدفة (Rudder)" },
  "short":   { "en": "One-line summary.", "ar": "ملخص في سطر واحد." },
  "details": { "en": ["Paragraph 1", "Paragraph 2"], "ar": ["الفقرة 1", "الفقرة 2"] },
  "location": { "en": "Trailing edge of the fin", "ar": "الحافة الخلفية للزعنفة" },
  "media": [{ "type": "image", "src": "media/rudder.webp", "caption": { "en": "…", "ar": "…" } }]
}
```

- **Media:** use `type` `image`, `video` or `youtube`. For `youtube`, `src` is the video id. Image and video files go in `public/media/`.
- **After every edit:** run `npm run validate`. It reports missing translations, unknown ids, missing media files and mesh names that are not in the model.

## Coordinates

Every position is in metres in the aircraft frame:

- the origin is the nose tip, projected onto the ground, on the centreline
- **+X** is towards the tail, **+Y** is up, and **+Z** is the left (port) side

`"mirror": true` copies an item to the right side.

## Component options in `systems.json`

| Option | Meaning |
|---|---|
| `"shape"` | `box`, `cylinder`, `capsule`, `ellipsoid`; `panel` (a slice of the wing, tailplane or fin, given as `span` and `chord` fractions); `seats` (rows of seats: `rows`, `pitch`, `abreast`) |
| `"style": "volume"` | A see-through box with edges, for compartments. Things inside it stay clickable |
| `"thickness"` | For `panel`: below 1 sits inside the skin (fuel tanks), above 1 stands proud (control surfaces) |
| `"markers": true` | On a system: always show a dot on each component (used for the small ground service points) |

The data sheet shown when nothing is selected comes from `specs` and `sources` in `aircraft.json`.

## The aircraft's name

`aircraft.json` also sets how the aircraft is introduced:

| Field | Used for |
|---|---|
| `name`, `manufacturer` | The data sheet title, the page title, and the small line above the type name |
| `designation` | The type name set large on the opening screen, in the corner of the 3D view and on the hangar floor (`"A320"`) |
| `tagline` | One line saying what the aircraft is |
| `highlights` | Up to six headline figures for the opening screen and the top of the data sheet. Write the unit after a space (`"37.57 m"`) so it is set smaller than the number |

## The 3D model

The current model has 212 separate objects with meaningless names ("Cylinder.027"). `mapping.json` says which is which. Its rudder and elevators are not separate objects, so they are cut out of the fin and tailplane by region; the radome, cockpit and APU are cut out of the fuselage the same way.

To go back to the built-in placeholder (which has sharklets), copy `model`, `frame`, `surfaces` and `credits` from `aircraft.placeholder.json` into `aircraft.json`, remove the `fuselage` block there, and copy `mapping.placeholder.json` over `mapping.json`.

## Swapping in another 3D model

The app does not need the model to have separate parts.

1. **Download.** Put candidate `.glb` files in `assets-src/` (see `assets-src/README.md`).
2. **Inspect.** Run `npm run inspect-model -- assets-src/model.glb` to list meshes, triangle counts and names.
3. **Optimise.** Run `npm run optimize-model -- assets-src/model.glb public/aircraft/a320/model.glb [--ratio 0.5]`. Mesh names are kept. Aim for 150k triangles or fewer and 5 MB or less.
4. **Point the aircraft at it.** In `aircraft.json`, set `"model": "aircraft/a320/model.glb"`. Then adjust `frame` (scale, rotation in degrees, offset) until the nose sits at the origin and the tail points to +X. Check with `?author=1`, Inspect: clicking the nose tip should read about `[0, y, 0]`.
5. **Map the parts.** In `mapping.json`:
   - list object names under `meshes` where the model already has separate parts;
   - for merged meshes, add `volumes` (boxes or ellipsoids) instead;
   - to cut a region out of one object, give the volume its own `"meshes": ["ObjectName"]`. Box volumes cut exactly along their faces, so the seam is straight.

   The surfaces used for fuel tanks and control-surface panels come from `surfaces` in `aircraft.json` (leading-edge points and chords of the wing, tailplane and fin). Measure them from the new model with `?author=1`, Inspect. The optional `fuselage` block places the frames drawn in the Systems view.

   Use `?author=1`, Volumes, to drag them into place while the model re-splits live. Then **Copy mapping JSON** and paste it into the file.
6. **Credit.** Add the model's author and licence to `credits` in `aircraft.json`. CC BY requires visible credit, which the Credits button provides.

## Adding pipes and components

1. Open the dev server with `?author=1`, choose **Route**, and switch to the Systems view.
2. Click on the aircraft to drop waypoints. Each point lands midway inside the skin; hold Shift to place it on the surface.
3. Use the top / side / front / rear buttons to line points up.
4. Press **Enter** to copy the route JSON, and paste it into the system's `routes` in `systems.json`.

A route's `from` and `to` can name a component's `partId`, so moving the component moves its pipes.

## Adding another aircraft

Copy `src/data/aircraft/a320/` to a new folder and change the four files. It then appears in the aircraft selector; no code changes are needed.

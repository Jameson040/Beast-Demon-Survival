# Stage III Placement Reference

The supplied `groundtruth.scene.v1` drawing is used as a composition guide, not as an asset-size standard. Its generated build instructions do not override that clarification.

## Coordinate Mapping

`src/game/scene.ts` is the single placement source for the game and the optional Field Plan (Tab).

- The gate `(52, 76)` becomes gameplay `(x: 0, z: 0)`.
- The Beast `(52, -61)` becomes `(x: 0, z: 1500)`.
- Plan east maps to game `+x`; plan north maps to game `+z`.
- Depth is adapted to the existing 1,500 m ride. Lateral placement uses 2.15 game metres per plan unit, keeping the broad layout readable with the existing telephoto projection and steering speed. This is deliberately not a uniform asset scale.
- As requested, the player starts at the gate rather than applying the sketch's slightly offset spawn marker literally.
- Existing horse, 20 m Beast, approximately 15 m Titan, 50 m city wall, tree and rock dimensions remain independently authored. The sketch's 4 m wall, 30 m boss, and footprint boxes are not imported as size specifications.

## Authoritative Placements

All 87 nature and district object anchors retain their individual reference coordinates through the shared mapping: 17 pines, 24 shrubs, 13 boulders, 20 houses, eight ruins, four watchtowers, and one great hall.

The defense uses the 18 exported Titan objects, not the stale "20" in their notes or a rebuilt equal-spacing formation. Titans 10 and 11 are absent, preserving the gap around the Beast. Outward headings are retained, with back-facing sprites visible from the gate. Levi's path uses the actual nine left-flank members.

The wall uses the reference semicircle centered on `(56, -24)`, radius 100 placement units. Its curtain faces are projected from connected world-space endpoints, not arranged as camera-facing panels. Both wings join an open gate. The camera begins behind the gate and eases into the original chase distance.

Major anchors remain stable across restarts. Procedural grass, small stones, wildflowers and extra gameplay rocks remain secondary dressing, with obstacle clearance around reference landmarks and the opening run-up.

Companions fan out from the gate rather than stacking at its edges. Foliage that would obscure the Beast fades gently instead of moving its reference anchor.

## Verification

Run `npx tsx --test tests/scene.test.ts` for geometry, placement stability, gate boundaries, rock collisions, vaults, shrapnel interception and the nine-member Levi route. Run `node tests/browser-check.mjs` with Playwright's Chromium installed for WebGL and input checks. Local screenshots are written to `.local-checks/`.

Production verification: `npx tsc --noEmit` and `npm run build`.

After building, `node tests/browser-check.mjs --production` checks the shipped single-file bundle. Install Chromium once with `npx playwright install --with-deps chromium` if it is not already available.
## Horse and rider options

The menu offers three independent visual sets. Classic is the original art and remains the default.

- **Classic** - the original Stage Two horse and rider sprites.
- **Upgraded** - the primitive-based experiment. Kept as a choice, not the default.
- **Rigged** - the third pass. Built from a CC0 rigged horse (Quaternius, Gallop clip) with an original rider seated on the horse's own saddle bone. Each 7 x 8 frame atlas is pre-rendered in 3D at the game's lighting, so turns use real view angles and the gallop is a real animation. The rider is rendered with a depth mask against the horse, so it cannot draw through the body.

The rigged set is coupled: choosing it for either horse or rider selects both, because the rider seats are baked together.

Regenerate with `node tools/probe-horse.mjs --bake`. Sources and licence: `tools/bake-horse/` and `tools/LICENSE-horse.md`.

## Horse and rider (rigged option, v2)

- The horse is the CC0 Quaternius horse (Gallop clip), re-lit and re-coloured. Its orientation comes from the skeleton: the head-to-tail vector is aligned with +z, so the horse faces away from the chase camera. Verified: forward (0, 0, 1), and its dot product with the view direction is 0.988.
- The rider is an original procedural figure posed by two-bone inverse kinematics on the horse's seat bone (Torso2). It has a draped cloak carrying the Wings of Freedom crest, ODM straps and hip canisters, riding boots in the stirrups, and reins to the horse's head.
- Nine views cover ±1.0 rad of yaw in 0.25 rad steps. Views use game yaw (positive is screen right), so turns lean the right way. Sprites lean slightly into turns.
- Atlases are baked by `node tools/bake-horse/run2.mjs --bake`. A review sheet comes from `--probe`.

## Shrapnel physics

- Fragments have air drag, tumble, bounce with impact-dependent restitution, friction that couples into spin, rolling resistance, and rest.
- The launch solver uses the closed-form solution under linear drag, so volleys still land on their aim points.
- Impacts leave craters (bounces above 2.2 m/s) and skid marks (sliding fragments). Scars persist until they pass behind the camera, with at most 260 at a time.
- Boulders are indexed in 8 m depth bands, and settled fragments are capped at 150. This keeps the per-frame cost low.

## Menu, pause and aftermath

- Pausing opens a panel with RESUME, RESTART and MENU. The toolbar also offers MENU during play.
- After a fatal charge, SKIP (or Enter) goes straight to the results screen instead of waiting out the aftermath.

## Placement adjustment

- District houses within 13 m of the charge line are moved out to 13 m, so a house never fills the camera as the rider passes. Their other plan positions are unchanged.

## Green Signal Salvos

- At 220 m, 740 m, and 1,220 m, every surviving rider launches at the same instant. The canisters travel forward under reduced-gravity signal flight and land in a scattered ring 15-100 m around the Beast rather than striking him.
- Each canister that carries a plume (one in four) releases a puff every 7 m of flight. Puffs are stored once and evaluated analytically: they expand from a small hot cloud into a billow, rise on warm air, drift on the breeze, pale with age, and disperse over about 18 seconds.
- Puffs are irregular, noise-edged textures rather than round gradients, so the plume reads as smoke instead of orbs. A burst at impact billows the smoke outward around the landing point.
- Live puffs are capped at 4,200 and drawn in a separate layer, so the cost stays bounded.

## Levi And The Beast

The confrontation preserves the Stage II gameplay and the 18 individually placed Titans, but its fight beats now follow the first encounter in *Hero* (season 3, episode 54): Levi emerges through the smoke after dropping the left flank, tears up the throwing arm, the Beast guards its nape, Levi blinds it, cuts its legs and remaining arm, attacks the nape after it falls, extracts Zeke, and the Cart Titan rescues him. The result copy no longer implies Zeke was killed.

Scene chronology cross-checked against the episode descriptions at [Surreal Resolution](https://www.surrealresolution.com/index.php/2019/05/31/attack-on-titan-s3-episode-54-hero/) and [Otaku Orbit](https://otakuorbit.com/attack-on-titan-episode-recap-review-2/). This is a gameplay approximation, not a frame-for-frame recreation.

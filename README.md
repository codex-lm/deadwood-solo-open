# Deadwood Solo Open

A single-player 3D survival FPS that runs entirely in your browser. Defend the cabin, survive twenty waves, fight the raiders and reach extraction. Rendering, movement, combat, enemy AI and campaign simulation all run on your device.

Published by Nilo. Created with Codex, Claude and Kimi.

This is an independent browser adaptation of [Deadwood - Last Light](https://github.com/cedricbernadac/deadwood-open), based on upstream commit `35ee1efed1bb448f9e2b6d66f7a6915e0e16bf90`. The upstream game and its hosted multiplayer service remain independent.

## Last Night — independent LOB7 Enhancement variant

Choose **Last Night** in the setup panel for a short survival challenge: ten
25-second waves, five-second resupplies and extraction at dawn (about five minutes).
Remaining enemies scatter at each timed wave end without granting kills or money.
Health and ammunition refill between waves. The usual weapons, movement and combat
remain; the short mode has no raider attacks, fuel expeditions or final colossus.

Pause whenever you need. Last Night has no mid-run saves; this is stated in the
pause menu. Replay keeps the same mode; leave to the home screen to choose another.
**Classic** retains the original twenty waves and its existing saves, and the
practice range remains available. English and French labels describe the mode,
countdown and ending.

Automatically produced by LOB7 Enhancement. Kimi K3 implemented the bounded mode
rules and initial simulation hooks; Nilo reviewed and integrated the interface,
transport, tests and publication. Original code, media licences and credits remain.

## Scope and implementation plan

1. Reuse the original cabin, rendering, weapons, enemies and twenty-wave rules.
2. Run the original simulation locally and replace its server transport with a single-survivor session. No gameplay server, WebSocket, worker or API key.
3. Provide solo menus, English by default, actual pause on menu/focus loss, a practice range, difficulty selection and local save/load. French is optional.
4. Build a static export, test the game and its save round trip, publish the exact edition on LOB7, then withdraw the former external-link editions while preserving their history.

The first edition includes the cabin. Multiplayer, AI teammates and the other maps are outside this solo edition. The source retains the upstream development files so the adaptation and original rules can be reviewed and tested.

## Build and preview

With Node.js 22 or newer:

```sh
npm ci
npm run build
npm start
```

Open `http://localhost:4173`. This server only serves static files from `dist-solo/`; it runs no game logic. Any static web host can serve that directory. The main publication branch contains this clean export and its editable JavaScript source. Development source, build tooling and tests are retained on `codex/solo-browser`.

```sh
npm run test:solo
```

## Play

Choose your survivor and prepare your night. Select difficulty in the solo lobby, then start. Keyboard and mouse or an Xbox-compatible gamepad are supported by the original game controls.

| Action | Keyboard and mouse |
| --- | --- |
| Move and look | WASD, ZQSD or arrows / mouse |
| Fire / heavy melee or scope | Left / right click |
| Run / crouch / jump | Shift / C / Space |
| Reload / switch weapons | R / 1-4 or mouse wheel |
| Interact / drop weapon | E / V |
| Grenade / umbrella | G / B |
| Menu and pause | Esc / P |
| Next wave early | N |

Click the view to capture the mouse and enable audio. Opening the menu or leaving the window pauses the night; resume deliberately. Save from the pause menu. Saves stay in browser storage, with JSON export/import for moving them. Browser storage can be unavailable or cleared; keep an exported save if it matters. Cooperative saves with multiple survivors cannot be loaded into this edition.

The first visit downloads the game and its assets. Once loaded, gameplay needs no server connection; this does not promise an offline-installable app or a cached reload without a connection.

## Licences and provenance

- Code: MIT. The upstream copyright and licence remain in `LICENSE`.
- Media: CC BY 4.0, with original attribution and generation sources in `ASSETS.md` (named `ASSETS-LICENSE.md` in the static export).
- Three.js: MIT; its licence notice is retained in the export.
- Some sounds from the hosted upstream game are not redistributable and were already excluded from the open sources. Synthesised fallbacks remain in use.

The development history preserves the upstream sources and the solo adaptation. Publication credits describe the publisher and development assistance; the upstream copyright and media attribution stay in the legal notices.

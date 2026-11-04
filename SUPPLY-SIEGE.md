# Supply Siege

An independent, automatically produced LOB7 Enhancement variant of **Deadwood Solo Open – Last Night**. Classic, Last Night and practice remain available. The shared simulation and Classic save format are unchanged.

Six assaults, each 30 seconds. Wounds, ammunition and armour persist between assaults. Start with four supply points; earn two after a normal assault. Planning freezes simulation, including projectiles and reloads, until you choose to defend again.

At each planning break you may buy each service once:

| Service | Cost | Effect |
| --- | ---: | --- |
| Ammunition | 1 | Fill magazines and reserves of carried guns |
| Medical kit | 2 | Restore 45 HP, capped at your character's maximum |
| Barricades | 2 | Repair all defended doors |
| Shotgun kit | 3 | Shotgun with ammunition, from assault 2; needs a free weapon slot |

Or conserve your stock. Existing racks, loot and manual repairs remain usable during combat. There is no purchase when the service would do nothing, no overspend, and no duplicate purchase in a single break.

Before assaults 1–5 you can **signal a convoy**: 45 seconds instead of 30, four extra enemies, five supply points instead of two if you survive. The last assault has no convoy: extraction follows, so there would be no useful delivery. There are no automatic health or ammunition refills. Clearing enemies early does not skip the clock. Enemies scatter at the time limit without awarding kill rewards.

Use mouse or Tab + Enter for planning; ordinary keyboard/mouse or gamepad controls for combat. P pauses. No mid-run saves for this challenge; Classic saves are unaffected. New UI and results support English and French, matching the parent.

## Source and validation

- Exact published parent: `br_s_4601945f-b008-44e6-b1d8-245509fc85b2`.
- Parent static commit: `63a9dd08bba1f7cddf1c17cb38f01dde44a4722f`.
- Editable parent: `9739da6295c5905f9a85268222c1f12ce7e28bb3`.
- Kimi K3 implemented the bounded pure economy/profile module and its tests. Nilo reviewed it, integrated the simulation, transport and UI, and tested the result.
- Run `npm ci`, `npm run test:solo`, `npm run build`.
- Static output: `dist-solo/`; no gameplay server, network dependency or new infrastructure.
- Original MIT code and CC BY 4.0 media credits retained. The source PR is a proposal; no merge into the original is implied.

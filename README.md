# node_doom

![DOOM running on Node.js CLI with SDL2](screenshot/doom.png)

**Video:** [DOOM running in Node.js](https://youtu.be/EkCBuIzdHHc)

DOOM generic ported from Harbour to **Node.js 20+ CLI + SDL2** (koffi). Not a web app, not Electron.

By **Wagner Nunes da Silva**

- vagucs@bol.com.br
- vagucs@vagucs.com.br
- vagucs@gmail.com
- [www.vagucs.com.br](https://www.vagucs.com.br)
- [LinkedIn](https://www.linkedin.com/in/wagner-nunes-da-silva-b0a15360)

This tree is a port of **[harbour_doom](https://github.com/vagucs/harbour_doom)** (`doom_hb`): the same Chocolate Doom / doomgeneric engine that first went from C to Harbour, then to Python (`doom_python`) and PHP (`php_doom`), now from Harbour to Node.js / TypeScript.

Every source file carries the same author header as the Harbour `.prg` files.

Versão em português: [README.pt.md](README.pt.md)

---

## What this project is

The Chocolate Doom / doomgeneric engine was translated to **Harbour** (`.prg` / `.ch`) with a thin C layer for Allegro 4.2.2. That work lives at [github.com/vagucs/harbour_doom](https://github.com/vagucs/harbour_doom). This directory is the **same study piece again**, in TypeScript:

- Window, keys, PCM: **SDL2** through **koffi** (no browser, no HTTP, no Electron)
- Framebuffer: 320×200, 8-bit PLAYPAL, `Uint8Array`, scaled in the window
- Game tick: 35 Hz (`TICRATE`), same as vanilla
- Renderer: BSP, visplanes, `R_DrawColumn` / `R_DrawSpan`, 16.16 `fixedMul` / `fixedDiv` (BigInt intermediates)
- Map: VERTEXES, LINEDEFS, SIDEDEFS, SECTORS, SEGS, SSECTORS, NODES, THINGS, BLOCKMAP, REJECT
- Play: walk, doors, lifts, switches, teleporters, exit, pickups, weapons (including chainsaw raise/cut), status bar, Tab automap, DS* sound, MUS→MIDI music, ESC menu (options, load/save), intermission tally, melt wipe, bunny scroll, monster look/chase/attack

You need a legal IWAD (shareware `doom1.wad` or commercial `doom.wad` / `doom2.wad` / etc.). This repository does not ship commercial WAD data.

It is a **complete gameplay port** of the Harbour engine into Node (the same systems as the finished PHP tree, including teleporters, extra cheats, `P_ChangeSector` platforms, and Screen Size via `-/+`). File count is condensed versus 100+ `.prg` files; behavior follows the Harbour sources.

Not in this tree (same cut as Harbour `boot.prg`):

- Network, CD music, joystick
- `-colors` palette quantize (Harbour-only experiment)
- Demo playback, full vanilla `info` state tables

---

## Educational purpose

This project is, above all, a **study piece**. DOOM (1993) is small enough to read end to end and dense enough to teach real engine work: BSP rendering, 16.16 fixed-point, a tic-based loop, a WAD file system.

The Harbour port taught how to read C in another language. Python dropped the preprocessor and 1-based arrays. PHP made the native boundary **FFI to SDL2**. This Node port keeps that FFI idea and adds one more lesson: **JavaScript `Number` is not a 32-bit int**. Products that overflow 2^53 must go through `BigInt` (`fixedMul` / `fixedDiv` in `src/compat.ts`).

What it is meant to teach:

- **Five languages, one engine.** C (`base_c/` in harbour_doom) → Harbour (`.prg`) → Python (`doom_python`) → PHP (`php_doom/src`) → TypeScript (`node_doom/src`). Same names (`P_Thrust`, `R_DrawColumn`, `A_Look`) so you can open the versions side by side.
- **What pointers were doing.** TypeScript uses objects and typed arrays; wrap-around, BAM angles and 16.16 overflow stay explicit (`asU32`, `shar`, `fixedMul`) because JS numbers do not wrap at 32 bits.
- **Where an interpreter is enough.** The whole game runs in Node. SDL2 is only the window, input, and PCM queue. koffi is the native boundary, like Allegro was in Harbour and FFI was in PHP.
- **CLI, not HTTP.** There is no browser canvas and no web server.
- **Legacy modernization.** Keep behavior identical, isolate the native layer, verify against the original.

Suggested way to study:

1. Run it, then read `doom.ts` and `src/game.ts` — boot, tic, input.
2. Compare `src/compat.ts` with Harbour `xhb_compat.prg` / `m_fixed.prg`, Python `doom/compat.py`, and PHP `src/Compat.php`.
3. Open `src/render.ts` next to `r_main.prg` / `r_bsp.prg` / `r_segs.prg` / `r_draw.prg`.
4. Follow a door from **Space** through `src/specials.ts`.
5. Follow a shot from **Ctrl** in `src/player.ts` to `Collision.lineAttack` and `Enemy`.

---

## From C / Harbour / Python / PHP to Node

TypeScript arrays are 0-based, like C, Python, and PHP. Harbour arrays were 1-based; that offset is gone here.

| DOOM in C | Harbour | Python | PHP | Node (this tree) |
|---|---|---|---|---|
| `struct` / `typedef struct` | `CLASS ... DATA` | `@dataclass` | `class` + typed properties | `class` + typed fields |
| `thing->x` | `thing:x` | `thing.x` | `$thing->x` | `thing.x` |
| `NULL` | `NIL` | `None` | `null` | `null` |
| `array[0]` | `array[1]` | `array[0]` | `$array[0]` | `array[0]` |
| `&`, `\|`, `^` | `hb_qbitAnd/Or/Xor` | `&`, `\|`, `^` | `&`, `\|`, `^` | `&`, `\|`, `^` |
| `x >> n` unsigned | `UShr(x, n)` | `ushr(x, n)` | `Compat::ushr($x, $n)` | `ushr(x, n)` |
| `x >> n` signed | `Shar(x, n)` | `shar(x, n)` | `Compat::shar($x, $n)` | `shar(x, n)` |
| 32-bit wrap | `AsU32` / `AsInt32` | `as_u32` / `as_i32` | `Compat::asU32` / `asI32` | `asU32` / `asI32` |
| `fixed_t` 16.16 | `FixedMul` / `FixedDiv` | `fixed_mul` / `fixed_div` | `Compat::fixedMul` / `fixedDiv` | `fixedMul` / `fixedDiv` (BigInt) |
| `byte *` framebuffer | Harbour string | `bytearray` + numpy LUT | `array<int>` + SDL ARGB8888 | `Uint8Array` + SDL ARGB8888 |
| Allegro 4.2.2 | GTALLEG / llibg | pygame | SDL2 via FFI | SDL2 via koffi |
| `Z_Malloc` | GC | GC | GC | GC |
| `PUBLIC` globals | `PUBLIC` / `MEMVAR` | fields on `Game` | public fields on `Game` | public fields on `Game` |
| 100+ `.prg` files | 1:1 with C | condensed `doom/*.py` | condensed `src/*.php` | condensed `src/*.ts` |

### Side-by-side: `P_Thrust`

C (`base_c/p_user.c` in harbour_doom):

```c
void P_Thrust (player_t* player, angle_t angle, fixed_t move)
{
    angle >>= ANGLETOFINESHIFT;
    player->mo->momx += FixedMul(move,finecosine[angle]);
    player->mo->momy += FixedMul(move,finesine[angle]);
}
```

Harbour (`p_user.prg`):

```harbour
PROCEDURE P_Thrust( player, angle, move )
    angle := UShr( angle, ANGLETOFINESHIFT )
    player:mo:momx += FixedMul( move, finecosine[ angle + 1 ] )
    player:mo:momy += FixedMul( move, finesine[ angle + 1 ] )
RETURN
```

Python (`doom/player.py`):

```python
def thrust(mo, angle, move):
    mo.momx += fixed_mul(move, fine_cos(angle))
    mo.momy += fixed_mul(move, fine_sin(angle))
```

PHP (`src/Player.php`):

```php
public static function thrust(Mobj $mo, int $angle, int $move): void
{
    $mo->momx += Compat::fixedMul($move, Tables::fineCos($angle));
    $mo->momy += Compat::fixedMul($move, Tables::fineSin($angle));
}
```

TypeScript (`src/player.ts`):

```typescript
static thrust(mo: Mobj, angle: number, move: number): void {
  mo.momx += fixedMul(move, fineCos(angle));
  mo.momy += fixedMul(move, fineSin(angle));
}
```

`.` stays `.` (like Python), unsigned shift lives in `fineCos`, and the Harbour `+ 1` index offset disappears. `fixedMul` uses `BigInt` so 32×32→64 products stay exact.

---

## What stays native, and why

TypeScript is **the game engine**. Native code stays only where Node cannot talk to the OS window or the mixer.

| Piece | Native API | Why |
|---|---|---|
| `src/video.ts` | SDL2 via **koffi** | Window, keyboard, ARGB8888 blit, PCM queue. Same role as Allegro in Harbour and FFI in PHP |
| `src/sound.ts` | winmm MCI via **koffi** (Windows) | MUS→MIDI playback (`mus2mid.ts` is still TypeScript) |
| `lib/SDL2.dll` | SDL2 64-bit | Drop-in library; set `SDL2_PATH` to override |

There is no compile step for the engine. `tsx` runs the `.ts` files directly.

---

## Technology

| Layer | This port | Harbour (`harbour_doom`) |
|---|---|---|
| Language | TypeScript ESM, Node 20+ (tested on 24.19.0 / npm 11.17.0) | Harbour / xHarbour |
| Window, keys, PCM | SDL2 (koffi) | Allegro 4.2.2 + GTALLEG |
| Palette blit / CRT | JS loop → `SDL_UpdateTexture` ARGB8888 | C in `doomgeneric_allegro.prg` |
| MIDI (Windows) | winmm MCI (koffi) | Allegro MIDI / MCI |
| IWAD | same WAD lumps | same |
| Build | none (`npx tsx doom.ts` or `run.bat`) | `compile.bat` / `hbmk2` |

Required Node:

```
node >= 20
npm install
```

SDL2: drop **SDL2.dll** (64-bit) in `lib/` on Windows, or set `SDL2_PATH`. The PHP port's `php_doom/lib/SDL2.dll` can be copied here. See `lib/README.txt`.

---

## Performance

Typical blit rate on the same PC (320×200, windowed, shareware IWAD). The game still ticks at 35 Hz (`TICRATE`); `-fps` shows this number.

| Port | Typical FPS |
|---|---|
| Harbour (`doom_hb`) | ~12 |
| Python (`doom_python`) | ~8 |
| PHP (`php_doom`) | ~20 |
| Node (`node_doom`) | ~100 |
| Java (`java_doom`) | ~180 (vsync-locked) |

---

## How to run

Node 20+, `npm install` once, SDL2 on the library path (or `node_doom/lib/SDL2.dll` on Windows). From this directory:

```
npm install
npx tsx doom.ts
npx tsx doom.ts -iwad DOOM1.WAD
npx tsx doom.ts -iwad ..\DOOM1.WAD -warp 1 1 -fps
npx tsx doom.ts -iwad DOOM1.WAD -crt
npm start
```

Windows helper — `run.bat` runs `npm install` if needed, copies SDL2 from `php_doom/lib` when missing, and if you omit `-iwad` looks for `DOOM1.WAD` here or in the parent `doom_minimal` folder:

```
run.bat
run.bat -fps
run.bat -iwad ..\DOOM1.WAD -warp 1 1 -crt
```

Linux: `sudo apt install libsdl2-2.0-0` then `npm install && npx tsx doom.ts`

macOS: `brew install sdl2` then `npm install && npx tsx doom.ts`

With no `-iwad` it looks for a `.wad` argument, then `doom1.wad` / `DOOM1.WAD` / `doom.wad` / `doom2.wad` in the current directory, `DOOMWADDIR`, this folder, and the parent `doom_minimal` folder.

---

## Keys

Classic DOOM controls (this condensed port; not remapped via `default.cfg`).

### Movement and actions

| Key | Action |
|---|---|
| Arrow keys | Forward, back, turn |
| **Shift** | Run |
| **Alt** | Strafe (hold) |
| **,** / **.** | Strafe left / right |
| **Ctrl** | Fire (hold to repeat; weapon animation + `A_ReFire`) |
| **Space** / **E** | Use / open door |
| **1** | Fist / chainsaw (toggle) |
| **2**–**7** | Pistol, shotgun, chaingun, rocket, plasma, BFG |
| **Enter** | Start from the title |
| **Tab** | Toggle automap |

Movement is **arrow keys only** (no WASD), so letter keys stay free for cheat codes.

### Automap (while the map is open)

| Key | Action |
|---|---|
| Arrow keys | Pan the map |
| **+** / **-** | Zoom |
| **0** | Fit / max zoom |
| **F** | Follow the player |
| **G** | Grid |
| **M** | Mark position |
| **C** | Clear marks |
| **Tab** | Close the map |
| **IDDT** | Cheat: all walls, then things (type while the map is open) |

### Menu and function keys

| Key | Action |
|---|---|
| **Esc** | Menu |
| **Enter** | Confirm / go forward |
| **Backspace** | Back |
| **Y** / **N** | Yes / No |
| **F2** | Save |
| **F3** | Load |
| **F11** | Toggle FPS overlay |
| **+** / **-** | Screen Size (same as Options) when the automap is closed |
| **Alt+Enter** | Toggle full-screen |

Options **Screen Size** and **Graphic Detail** (HIGH/LOW) change the 3D view (`R_SetViewSize`), not the window scale. Window scale: drag the window or Alt+Enter.

### Cheats (nostalgia only)

Type these on the keyboard during play; no Enter needed:

| Code | Effect |
|---|---|
| **IDDQD** | God mode (_Degreelessness Mode_); HUD face `STFGOD0` |
| **IDKFA** | All weapons, ammo, keys, and armor |
| **IDFA** | Weapons, ammo, and armor (no keys) |
| **IDCLIP** / **IDSPISPOPD** | No clipping |
| **IDDT** | Automap cheat (type while the map is open): all walls, then things |

---

## Command-line parameters

### IWAD

| Parameter | Description |
|---|---|
| `-iwad file.wad` | IWAD to load (path or filename) |
| `file.wad` | Same thing, without `-iwad` |

### Video

| Parameter | Description |
|---|---|
| `-fullscreen` | Start in a fullscreen window |
| `-crt` | Scanline-style CRT look (Harbour `-crt` family). Clearer at window scale 2× or more |
| `-fps` | Show frames per second on the HUD (top-right) and in the window title. **F11** toggles |

### Game

| Parameter | Description |
|---|---|
| `-warp e m` | Skip the title and start episode `e` map `m` |
| `-skill n` | 0 baby … 4 nightmare (default 2, Hurt Me Plenty) |
| `-nomonsters` | Do not spawn enemies |

Harbour-only flags **not** implemented here: `-videoc`, `-scaling`, `-gfxmode`, `-colors`, `-nosound` / `-nosfx` / `-nomusic`, `-config`, net/CD/joystick.

---

## Layout

```
doom.ts              entry: npx tsx doom.ts
run.bat              Windows helper (npm install + default IWAD)
package.json         Node >=20, koffi, tsx
src/                 engine (TypeScript ESM)
lib/                 drop SDL2.dll / libSDL2 here
screenshot/doom.png  README screenshot
docs/                donation QR codes
```

| Path | Vanilla / Harbour |
|---|---|
| `src/compat.ts` | `m_fixed`, `xhb_compat` |
| `src/defs.ts` | `doomdef`, `doomtype`, `doomkeys` constants |
| `src/bin.ts` | little-endian WAD / map readers |
| `src/keys.ts` | `doomkeys` / SDL keycodes |
| `src/wad.ts` | `w_wad` |
| `src/video.ts` | `i_video`, `doomgeneric_allegro` (SDL2 + `-crt`) |
| `src/vvideo.ts` | `v_video` |
| `src/tables.ts` | `tables` |
| `src/rdata.ts` | `r_data` |
| `src/render.ts` | `r_main` `r_bsp` `r_segs` `r_plane` `r_draw` |
| `src/world.ts` | `p_setup` |
| `src/collision.ts` | `p_map` `p_maputl` `p_sight` (REJECT) |
| `src/player.ts` | `p_user` `p_pspr` |
| `src/specials.ts` | `p_spec` `p_doors` `p_plats` `p_floor` `p_switch` `p_telept` |
| `src/mobj.ts` | `info` `p_inter` |
| `src/sprites.ts` | `r_things` |
| `src/enemy.ts` | `p_enemy` (look / chase / attack) |
| `src/status.ts` | `st_stuff` |
| `src/ammap.ts` | `am_map` |
| `src/sound.ts` | `i_sound`, CacheSFX, MCI music on Windows |
| `src/mus2mid.ts` | `mus2mid.c` |
| `src/menu.ts` | `m_menu` |
| `src/saveg.ts` | `p_saveg` (24-byte name + JSON) |
| `src/wistuff.ts` | `wi_stuff` |
| `src/wipe.ts` | `f_wipe` melt |
| `src/finale.ts` | `f_finale` (text + bunny scroll) |
| `src/game.ts` | `d_main` `g_game` `d_loop` `boot` |

---

## Lineage

1. **id Software DOOM** (1993) — original engine
2. **Chocolate Doom / doomgeneric** — portable C
3. **[harbour_doom](https://github.com/vagucs/harbour_doom)** — Harbour + Allegro 4.2.2 (`Doom_hb.exe`)
4. **doom_python** — Python + pygame, from that Harbour port
5. **php_doom** — PHP 8 CLI + SDL2 FFI, from the same Harbour gameplay
6. **This tree** — Node.js CLI + TypeScript + SDL2 (koffi), sourced from the same Harbour gameplay (100% of gameplay intent from the `.prg` files; condensed file count)

---

## Donate

### Ethereum

`0x1b64038A2b1DB73ABd0068d8B9B0d1dC5a90C5F1`

![Ethereum QR Code](docs/qr-ethereum.png)

### PIX

Key: `vagucs@bol.com.br`

![PIX QR Code](docs/qr-pix.png)

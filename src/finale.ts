/**
 * DOOM generic portado de Harbour para Node.js CLI com SDL2.
 *
 * Por Wagner Nunes da Silva
 *
 * vagucs@bol.com.br
 * vagucs@vagucs.com.br
 * vagucs@gmail.com
 *
 * www.vagucs.com.br
 */

import { u32 } from "./bin.ts";
import { intdiv } from "./compat.ts";
import { HU_FONTEND, HU_FONTSTART, SCREENHEIGHT, SCREENWIDTH } from "./defs.ts";
import type { Game } from "./game.ts";
import { KP_ENTER, LCTRL, RCTRL, RETURN, SPACE } from "./keys.ts";
import { drawPatch, fill, patchSize } from "./vvideo.ts";

export class Finale {
  private static readonly TEXT_SPEED = 3;
  private static readonly TEXT_WAIT = 250;
  private static readonly TEXT = 0;
  private static readonly ART = 1;
  private static readonly E1 =
    "Once you beat the big badasses and\nclean out the moon base you're supposed\nto win, aren't you? Aren't you? Where's\nyour fat reward and ticket home? What\nthe hell is this? It's not supposed to\nend this way!\n\nIt stinks like rotten meat, but looks\nlike the lost Deimos base.  Looks like\nyou're stuck on The Shores of Hell.\nThe only way out is through.\n\nTo continue the DOOM experience, play\nThe Shores of Hell and its amazing\nsequel, Inferno!\n";
  private static readonly E2 =
    "You've done it! The hideous cyber-\ndemon lord that ruled the lost Deimos\nmoon base has been slain and you\nare triumphant! But ... where are\nyou? You clamber to the edge of the\nmoon and look down to see the awful\ntruth.\n\nDeimos floats above Hell itself!\nYou've never heard of anyone escaping\nfrom Hell, but you'll make the bastards\nsorry they ever heard of you! Quickly,\nyou rappel down to the surface of\nHell.\n\nNow, it's on to the final chapter of\nDOOM! -- Inferno.\n";
  private static readonly E3 =
    "The loathsome spiderdemon that\nmasterminded the invasion of the moon\nbases and caused so much death has had\nits ass kicked for all time.\n\nA hidden doorway opens and you enter.\nYou've proven too tough for Hell to\ncontain, and now Hell at last plays\nfair -- for you emerge from the door\nto see the green fields of Earth!\nHome at last.\n\nYou wonder what's been happening on\nEarth while you were battling evil\nunleashed. It's good that no Hell-\nspawn could have come through that\ndoor with you ...\n";
  private static readonly C1 =
    "You have won! Your victory has enabled\nhumankind to evacuate Earth and escape\nthe nightmare.  Now you are the only\nhuman left on the face of the planet.\nCan you defeat the final enemy and\nreturn to Earth, or will you just\nrot here with the rest of the walking\ndead?\n";

  private game: Game;
  private stage = Finale.TEXT;
  private count = 0;
  done = false;
  private text: string;
  private flat: string;
  private flatLump: Buffer | null = null;
  private art: Buffer | null = null;
  private pfub1: Buffer | null = null;
  private pfub2: Buffer | null = null;
  private lastBunnyStage = -1;

  constructor(game: Game) {
    this.game = game;
    const commercial = game.wad.checkNumForName("MAP01") >= 0;
    if (commercial) {
      this.text = Finale.C1;
      this.flat = "SLIME16";
      game.sound.changeMusic("read_m", true);
    } else {
      this.text = ({ 1: Finale.E1, 2: Finale.E2, 3: Finale.E3 } as Record<number, string>)[game.episode] ?? Finale.E1;
      this.flat =
        ({ 1: "FLOOR4_8", 2: "SFLR6_1", 3: "MFLR8_4", 4: "MFLR8_3" } as Record<number, string>)[game.episode] ??
        "FLOOR4_8";
      game.sound.changeMusic("victor", true);
    }
    this.flatLump = this.lump(this.flat);
    const art = game.episode === 2 ? "VICTORY2" : game.episode === 4 ? "ENDPIC" : this.has("CREDIT") ? "CREDIT" : "HELP2";
    this.art = this.lump(art) ?? this.lump("HELP1");
    if (game.episode === 3 && !commercial) {
      this.pfub1 = this.lump("PFUB1");
      this.pfub2 = this.lump("PFUB2");
    }
  }

  ticker(): void {
    ++this.count;
    if (this.stage === Finale.TEXT && this.count > this.text.length * Finale.TEXT_SPEED + Finale.TEXT_WAIT) {
      this.stage = Finale.ART;
      this.count = 0;
      this.game.forceWipe = true;
      if (this.game.episode === 3) this.game.sound.changeMusic("bunny", true);
    } else if (this.stage === Finale.ART && this.wantSkip() && this.count > 10) {
      this.done = true;
    }
  }

  draw(fb: Uint8Array): void {
    if (this.stage === Finale.ART) {
      if (this.game.episode === 3 && this.pfub1 !== null && this.pfub2 !== null) {
        this.drawBunny(fb);
      } else if (this.art !== null) {
        fill(fb, 0);
        drawPatch(fb, 0, 0, this.art);
      }
      return;
    }
    this.fillFlat(fb);
    const shown = intdiv(this.count, Finale.TEXT_SPEED);
    let x = 10;
    let y = 10;
    for (let i = 0; i < this.text.length; ++i) {
      if (i >= shown) break;
      const char = this.text[i]!;
      if (char === "\n") {
        x = 10;
        y += 11;
        continue;
      }
      const code = char.toUpperCase().charCodeAt(0);
      if (char === " " || code < HU_FONTSTART || code > HU_FONTEND) {
        x += 4;
        continue;
      }
      const patch = this.lump(`STCFN${String(code).padStart(3, "0")}`);
      if (patch === null) {
        x += 4;
        continue;
      }
      const [width] = patchSize(patch);
      if (x + width > SCREENWIDTH) break;
      drawPatch(fb, x, y, patch);
      x += width;
    }
  }

  private fillFlat(fb: Uint8Array): void {
    if (this.flatLump === null || this.flatLump.length < 4096) {
      fill(fb, 0);
      return;
    }
    for (let y = 0; y < SCREENHEIGHT; ++y) {
      const row = (y & 63) << 6;
      for (let x = 0; x < SCREENWIDTH; ++x) fb[y * SCREENWIDTH + x] = this.flatLump[row + (x & 63)]!;
    }
  }

  private drawBunny(fb: Uint8Array): void {
    fill(fb, 0);
    const scroll = Math.max(0, Math.min(320, 320 - intdiv(this.count - 230, 2)));
    for (let x = 0; x < SCREENWIDTH; ++x) {
      const column = x + scroll;
      this.drawPatchColumn(
        fb,
        x,
        column < 320 ? this.pfub2! : this.pfub1!,
        column < 320 ? column : column - 320,
      );
    }
    if (this.count < 1130) return;
    const stage = this.count < 1180 ? 0 : Math.min(6, intdiv(this.count - 1180, 5));
    if (stage > this.lastBunnyStage) {
      this.game.sound.play("pistol");
      this.lastBunnyStage = stage;
    }
    const patch = this.lump(`END${stage}`);
    if (patch !== null) drawPatch(fb, intdiv(320 - 104, 2), intdiv(200 - 64, 2), patch);
  }

  private drawPatchColumn(fb: Uint8Array, x: number, patch: Buffer, column: number): void {
    if (column < 0) return;
    const offsetPos = 8 + column * 4;
    if (offsetPos + 4 > patch.length) return;
    let offset = u32(patch, offsetPos);
    while (offset < patch.length && patch[offset] !== 255) {
      const top = patch[offset]!;
      const length = patch[offset + 1]!;
      const source = offset + 3;
      for (let i = 0; i < length && top + i < 200; ++i) fb[(top + i) * 320 + x] = patch[source + i]!;
      offset += length + 4;
    }
  }

  private wantSkip(): boolean {
    if (this.game.menu?.active) return false;
    for (const key of [LCTRL, RCTRL, SPACE, RETURN, KP_ENTER, "e".charCodeAt(0)]) {
      if (this.game.keys[key]) return true;
    }
    return false;
  }

  private has(name: string): boolean {
    return this.game.wad.checkNumForName(name) >= 0;
  }

  private lump(name: string): Buffer | null {
    const n = this.game.wad.checkNumForName(name);
    return n < 0 ? null : this.game.wad.cacheLumpNum(n);
  }
}

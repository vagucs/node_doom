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

import { intdiv } from "./compat.ts";
import {
  AM_CELL,
  AM_CLIP,
  AM_MISL,
  AM_SHELL,
  CF_GODMODE,
  HU_FONTEND,
  HU_FONTSTART,
  IT_BLUECARD,
  IT_BLUESKULL,
  IT_REDCARD,
  IT_REDSKULL,
  IT_YELLOWCARD,
  IT_YELLOWSKULL,
  WP_BFG,
  WP_CHAINGUN,
  WP_MISSILE,
  WP_PLASMA,
  WP_SHOTGUN,
  WP_SUPERSHOTGUN,
} from "./defs.ts";
import { Player } from "./player.ts";
import { drawPatch, patchSize } from "./vvideo.ts";
import type { Wad } from "./wad.ts";

export class Status {
  private static readonly AMMO_X = 44;
  private static readonly AMMO_Y = 171;
  private static readonly HEALTH_X = 90;
  private static readonly HEALTH_Y = 171;
  private static readonly ARMOR_X = 221;
  private static readonly ARMOR_Y = 171;
  private static readonly FACE_X = 143;
  private static readonly FACE_Y = 168;
  private static readonly ARMS_X = 111;
  private static readonly ARMS_Y = 172;
  private static readonly KEY_X = 239;

  private wad: Wad;
  private sbar: Buffer;
  private tallNum: Buffer[] = [];
  private shortNum: Buffer[] = [];
  private percent: Buffer;
  private keys: Array<Buffer | null> = [];
  private armsBg: Buffer | null;
  private armsOff: Buffer[] = [];
  private faces: Buffer[] = [];
  private godFace: Buffer;
  private deadFace: Buffer | null;
  private font: Array<Buffer | null> = [];

  constructor(wad: Wad) {
    this.wad = wad;
    this.sbar = wad.cacheLumpName("STBAR");
    for (let i = 0; i < 10; ++i) {
      this.tallNum.push(wad.cacheLumpName(`STTNUM${i}`));
      this.shortNum.push(wad.cacheLumpName(`STYSNUM${i}`));
    }
    this.percent = wad.cacheLumpName("STTPRCNT");
    for (let i = 0; i < 6; ++i) this.keys.push(this.optional(`STKEYS${i}`));
    this.armsBg = this.optional("STARMS");
    for (let i = 2; i < 8; ++i) this.armsOff.push(wad.cacheLumpName(`STGNUM${i}`));
    const fallback = wad.cacheLumpName("STFST00");
    for (let pain = 0; pain < 5; ++pain) this.faces.push(this.optional(`STFST${pain}0`) ?? fallback);
    this.godFace = this.optional("STFGOD0") ?? fallback;
    this.deadFace = this.optional("STFDEAD0");
    for (let ch = HU_FONTSTART; ch <= HU_FONTEND; ++ch) {
      this.font.push(this.optional(`STCFN${String(ch).padStart(3, "0")}`));
    }
  }

  private optional(name: string): Buffer | null {
    const n = this.wad.checkNumForName(name);
    return n >= 0 ? this.wad.cacheLumpNum(n) : null;
  }

  draw(fb: Uint8Array, player: Player, showMessages = true): void {
    drawPatch(fb, 0, 168, this.sbar);
    if (this.armsBg !== null) drawPatch(fb, 104, 168, this.armsBg);
    const weaponAmmo = Player.WEAPON_AMMO[player.readyweapon] ?? null;
    const ammo = weaponAmmo === null ? 0 : player.ammo[weaponAmmo] ?? 0;
    this.number(fb, Status.AMMO_X, Status.AMMO_Y, ammo, 3, this.tallNum);
    this.number(fb, Status.HEALTH_X, Status.HEALTH_Y, player.health, 3, this.tallNum);
    drawPatch(fb, Status.HEALTH_X, Status.HEALTH_Y, this.percent);
    this.number(fb, Status.ARMOR_X, Status.ARMOR_Y, player.armorpoints, 3, this.tallNum);
    drawPatch(fb, Status.ARMOR_X, Status.ARMOR_Y, this.percent);

    const owned = [
      (player.weaponowned[WP_SHOTGUN] ?? false) || (player.weaponowned[WP_SUPERSHOTGUN] ?? false),
      player.weaponowned[WP_CHAINGUN] ?? false,
      player.weaponowned[WP_MISSILE] ?? false,
      player.weaponowned[WP_PLASMA] ?? false,
      player.weaponowned[WP_BFG] ?? false,
      false,
    ];
    for (let i = 0; i < 6; ++i) {
      const x = Status.ARMS_X + (i % 3) * 12;
      const y = Status.ARMS_Y + intdiv(i, 3) * 10;
      if (owned[i]) this.digit(fb, x, y, i + 2, this.shortNum);
      else drawPatch(fb, x, y, this.armsOff[i]!);
    }

    const health = Math.min(100, Math.max(0, Math.trunc(player.health)));
    const pain = player.health <= 0 ? 4 : Math.min(4, intdiv((100 - health) * 5, 101));
    if (player.health <= 0) {
      drawPatch(fb, Status.FACE_X, Status.FACE_Y, this.deadFace ?? this.faces[4]!);
    } else if ((player.cheats & CF_GODMODE) !== 0) {
      drawPatch(fb, Status.FACE_X, Status.FACE_Y, this.godFace);
    } else {
      drawPatch(fb, Status.FACE_X, Status.FACE_Y, this.faces[pain]!);
    }

    const slots: Array<[number, number]> = [
      [IT_BLUECARD, IT_BLUESKULL],
      [IT_YELLOWCARD, IT_YELLOWSKULL],
      [IT_REDCARD, IT_REDSKULL],
    ];
    for (let slot = 0; slot < slots.length; ++slot) {
      const [card, skull] = slots[slot]!;
      if ((player.cards[card] ?? false) || (player.cards[skull] ?? false)) {
        const index = (player.cards[skull] ?? false) ? skull : card;
        if (this.keys[index] != null) drawPatch(fb, Status.KEY_X, 171 + slot * 10, this.keys[index]!);
      }
    }
    const order = [AM_CLIP, AM_SHELL, AM_CELL, AM_MISL];
    const ammoPos: Array<[number, number]> = [[288, 173], [288, 179], [288, 191], [288, 185]];
    const maxPos: Array<[number, number]> = [[314, 173], [314, 179], [314, 191], [314, 185]];
    for (let i = 0; i < order.length; ++i) {
      const type = order[i]!;
      this.number(fb, ammoPos[i]![0], ammoPos[i]![1], player.ammo[type]!, 3, this.shortNum);
      this.number(fb, maxPos[i]![0], maxPos[i]![1], player.maxammo[type]!, 3, this.shortNum);
    }
    if (showMessages && player.message !== "") this.drawText(fb, 0, 0, player.message);
  }

  private digit(fb: Uint8Array, x: number, y: number, n: number, font: Buffer[]): void {
    drawPatch(fb, x, y, font[Math.max(0, Math.min(9, n))]!);
  }

  private number(fb: Uint8Array, x: number, y: number, value: number, digits: number, font: Buffer[]): void {
    const [width] = patchSize(font[0]!);
    x -= width;
    value = Math.abs(value);
    for (let i = 0; i < digits; ++i) {
      drawPatch(fb, x, y, font[value % 10]!);
      x -= width;
      value = intdiv(value, 10);
      if (value === 0) break;
    }
  }

  drawText(fb: Uint8Array, x: number, y: number, text: string): void {
    for (const ch of text.toUpperCase()) {
      const index = ch.charCodeAt(0) - HU_FONTSTART;
      const patch = index >= 0 && index < this.font.length ? this.font[index] : null;
      if (patch == null) {
        x += 4;
        continue;
      }
      drawPatch(fb, x, y, patch);
      const [width] = patchSize(patch);
      x += width;
    }
  }
}

export const StatusBar = Status;

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

import { Collision } from "./collision.ts";
import { asU32, intdiv } from "./compat.ts";
import {
  AM_CELL,
  AM_CLIP,
  AM_MISL,
  AM_SHELL,
  ANG45,
  ANG180,
  CF_GODMODE,
  HU_FONTEND,
  HU_FONTSTART,
  IT_BLUECARD,
  IT_BLUESKULL,
  IT_REDCARD,
  IT_REDSKULL,
  IT_YELLOWCARD,
  IT_YELLOWSKULL,
  TICRATE,
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

const ST_NUMPAINFACES = 5;
const ST_NUMSTRAIGHTFACES = 3;
const ST_NUMTURNFACES = 2;
const ST_NUMSPECIALFACES = 3;
const ST_FACESTRIDE = ST_NUMSTRAIGHTFACES + ST_NUMTURNFACES + ST_NUMSPECIALFACES;
const ST_TURNOFFSET = ST_NUMSTRAIGHTFACES;
const ST_OUCHOFFSET = ST_TURNOFFSET + ST_NUMTURNFACES;
const ST_EVILGRINOFFSET = ST_OUCHOFFSET + 1;
const ST_RAMPAGEOFFSET = ST_EVILGRINOFFSET + 1;
const ST_GODFACE = ST_NUMPAINFACES * ST_FACESTRIDE;
const ST_DEADFACE = ST_GODFACE + 1;
const ST_EVILGRINCOUNT = 2 * TICRATE;
const ST_STRAIGHTFACECOUNT = Math.trunc(TICRATE / 2);
const ST_TURNCOUNT = TICRATE;
const ST_RAMPAGEDELAY = 2 * TICRATE;
const ST_MUCHPAIN = 20;

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
  private faces: Array<Buffer | null> = [];
  private fallbackFace: Buffer;
  private font: Array<Buffer | null> = [];

  private faceIndex = 0;
  private faceCount = 0;
  private facePriority = 0;
  private oldHealth = -1;
  private painOldHealth = -1;
  private lastCalc = 0;
  private lastAttackDown = -1;
  private oldWeaponsOwned: boolean[] = [];
  private rnd = 1;

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
    this.fallbackFace = wad.cacheLumpName("STFST00");
    for (let pain = 0; pain < ST_NUMPAINFACES; ++pain) {
      for (let look = 0; look < ST_NUMSTRAIGHTFACES; ++look) this.faces.push(this.optional(`STFST${pain}${look}`));
      this.faces.push(this.optional(`STFTR${pain}0`));
      this.faces.push(this.optional(`STFTL${pain}0`));
      this.faces.push(this.optional(`STFOUCH${pain}`));
      this.faces.push(this.optional(`STFEVL${pain}`));
      this.faces.push(this.optional(`STFKILL${pain}`));
    }
    this.faces.push(this.optional("STFGOD0"));
    this.faces.push(this.optional("STFDEAD0"));
    for (let ch = HU_FONTSTART; ch <= HU_FONTEND; ++ch) {
      this.font.push(this.optional(`STCFN${String(ch).padStart(3, "0")}`));
    }
    this.reset(null);
  }

  reset(player: Player | null): void {
    this.faceIndex = 0;
    this.faceCount = 0;
    this.facePriority = 0;
    this.oldHealth = -1;
    this.painOldHealth = -1;
    this.lastCalc = 0;
    this.lastAttackDown = -1;
    this.oldWeaponsOwned = player !== null ? [...player.weaponowned] : Array(9).fill(false);
  }

  ticker(player: Player | null): void {
    if (player === null) return;
    this.rnd = (Math.imul(this.rnd, 1103515245) + 12345) >>> 0;
    const stRandom = (this.rnd >>> 16) & 255;
    this.updateFaceWidget(player, stRandom);
    this.oldHealth = player.health;
  }

  private optional(name: string): Buffer | null {
    const n = this.wad.checkNumForName(name);
    return n >= 0 ? this.wad.cacheLumpNum(n) : null;
  }

  private facePatch(index: number): Buffer {
    return this.faces[index] ?? this.fallbackFace;
  }

  private calcPainOffset(player: Player): number {
    const health = Math.min(100, Math.max(0, Math.trunc(player.health)));
    if (health !== this.painOldHealth) {
      this.lastCalc = ST_FACESTRIDE * intdiv((100 - health) * ST_NUMPAINFACES, 101);
      this.painOldHealth = health;
    }
    return this.lastCalc;
  }

  private updateFaceWidget(player: Player, stRandom: number): void {
    if (this.facePriority < 10 && player.health <= 0) {
      this.facePriority = 9;
      this.faceIndex = ST_DEADFACE;
      this.faceCount = 1;
    }

    if (this.facePriority < 9 && player.bonuscount) {
      let doEvilGrin = false;
      const n = Math.min(this.oldWeaponsOwned.length, player.weaponowned.length);
      for (let i = 0; i < n; ++i) {
        if (this.oldWeaponsOwned[i] !== player.weaponowned[i]) {
          doEvilGrin = true;
          this.oldWeaponsOwned[i] = player.weaponowned[i]!;
        }
      }
      if (doEvilGrin) {
        this.facePriority = 8;
        this.faceCount = ST_EVILGRINCOUNT;
        this.faceIndex = this.calcPainOffset(player) + ST_EVILGRINOFFSET;
      }
    }

    if (
      this.facePriority < 8 &&
      player.damagecount &&
      player.attacker !== null &&
      player.mo !== null &&
      player.attacker !== player.mo
    ) {
      this.facePriority = 7;
      if (player.health - this.oldHealth > ST_MUCHPAIN) {
        this.faceCount = ST_TURNCOUNT;
        this.faceIndex = this.calcPainOffset(player) + ST_OUCHOFFSET;
      } else {
        const badguyangle = Collision.angleTo(player.mo.x, player.mo.y, player.attacker.x, player.attacker.y);
        let diffang: number;
        let turnRight: boolean;
        if (asU32(badguyangle) > asU32(player.mo.angle)) {
          diffang = asU32(badguyangle - player.mo.angle);
          turnRight = diffang > asU32(ANG180);
        } else {
          diffang = asU32(player.mo.angle - badguyangle);
          turnRight = diffang <= asU32(ANG180);
        }
        this.faceCount = ST_TURNCOUNT;
        this.faceIndex = this.calcPainOffset(player);
        if (diffang < asU32(ANG45)) this.faceIndex += ST_RAMPAGEOFFSET;
        else if (turnRight) this.faceIndex += ST_TURNOFFSET;
        else this.faceIndex += ST_TURNOFFSET + 1;
      }
    }

    if (this.facePriority < 7 && player.damagecount) {
      if (player.health - this.oldHealth > ST_MUCHPAIN) {
        this.facePriority = 7;
        this.faceCount = ST_TURNCOUNT;
        this.faceIndex = this.calcPainOffset(player) + ST_OUCHOFFSET;
      } else {
        this.facePriority = 6;
        this.faceCount = ST_TURNCOUNT;
        this.faceIndex = this.calcPainOffset(player) + ST_RAMPAGEOFFSET;
      }
    }

    if (this.facePriority < 6) {
      if (player.attackdown) {
        if (this.lastAttackDown === -1) this.lastAttackDown = ST_RAMPAGEDELAY;
        else {
          this.lastAttackDown--;
          if (this.lastAttackDown === 0) {
            this.facePriority = 5;
            this.faceIndex = this.calcPainOffset(player) + ST_RAMPAGEOFFSET;
            this.faceCount = 1;
            this.lastAttackDown = 1;
          }
        }
      } else this.lastAttackDown = -1;
    }

    if (this.facePriority < 5 && (player.cheats & CF_GODMODE) !== 0) {
      this.facePriority = 4;
      this.faceIndex = ST_GODFACE;
      this.faceCount = 1;
    }

    if (this.faceCount === 0) {
      this.faceIndex = this.calcPainOffset(player) + (stRandom % 3);
      this.faceCount = ST_STRAIGHTFACECOUNT;
      this.facePriority = 0;
    }
    this.faceCount--;
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

    drawPatch(fb, Status.FACE_X, Status.FACE_Y, this.facePatch(this.faceIndex));

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

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
import { asU32, fixedMul, intdiv } from "./compat.ts";
import {
  AM_CELL,
  AM_CLIP,
  AM_MISL,
  AM_SHELL,
  ANG90,
  BT_ATTACK,
  BT_CHANGE,
  BT_USE,
  BT_WEAPONMASK,
  BT_WEAPONSHIFT,
  FINEANGLES,
  FINEMASK,
  FRACUNIT,
  FRICTION,
  GRAVITY,
  MAXBOB,
  MELEERANGE,
  MF_NOCLIP,
  MF_SHOOTABLE,
  MF_SOLID,
  MISSILERANGE,
  PST_DEAD,
  PST_LIVE,
  STOPSPEED,
  TICRATE,
  VIEWHEIGHT,
  WP_BFG,
  WP_CHAINGUN,
  WP_CHAINSAW,
  WP_FIST,
  WP_MISSILE,
  WP_NOCHANGE,
  WP_PISTOL,
  WP_PLASMA,
  WP_SHOTGUN,
  WP_SUPERSHOTGUN,
} from "./defs.ts";
import { Enemy } from "./enemy.ts";
import type { Game } from "./game.ts";
import { Mobj } from "./mobj.ts";
import { Sprites } from "./sprites.ts";
import { finesine, fineCos, fineSin } from "./tables.ts";
import type { MapThing, World } from "./world.ts";

export class Ticcmd {
  constructor(
    public forwardmove = 0,
    public sidemove = 0,
    public angleturn = 0,
    public buttons = 0,
  ) {}
}

type AttackStep = [string, number, number, string, number, number];

export class Player {
  static readonly FORWARDMOVE = [0x19, 0x32];
  static readonly SIDEMOVE = [0x18, 0x28];
  static readonly ANGLETURN = [640, 1280, 320];
  static readonly MAXAMMO = [200, 50, 300, 50];
  static readonly CLIPAMMO = [10, 4, 20, 1];
  static readonly WEAPON_AMMO: Record<number, number> = {
    [WP_PISTOL]: AM_CLIP,
    [WP_SHOTGUN]: AM_SHELL,
    [WP_SUPERSHOTGUN]: AM_SHELL,
    [WP_CHAINGUN]: AM_CLIP,
    [WP_MISSILE]: AM_MISL,
    [WP_PLASMA]: AM_CELL,
    [WP_BFG]: AM_CELL,
  };

  mo: Mobj | null;
  cmd: Ticcmd;
  playerstate = PST_LIVE;
  viewz = 0;
  viewheight = VIEWHEIGHT;
  deltaviewheight = 0;
  bob = 0;
  health = 100;
  armorpoints = 0;
  armortype = 0;
  ammo = [50, 0, 0, 0];
  maxammo = [...Player.MAXAMMO];
  weaponowned = [true, true, false, false, false, false, false, false, false];
  pendingweapon = WP_NOCHANGE;
  readyweapon = WP_PISTOL;
  cards = [false, false, false, false, false, false];
  cheats = 0;
  message = "";
  messageTics = 0;
  attackdown = false;
  usedown = false;
  damagecount = 0;
  bonuscount = 0;
  extralight = 0;
  refire = 0;
  killcount = 0;
  itemcount = 0;
  secretcount = 0;
  didsecret = false;
  pspriteY = 32;
  pspriteSy = 128 * FRACUNIT;
  pspriteState = "up";
  pspriteTics = 0;
  pspriteStep = 0;
  pspriteBody = "";
  pspriteFlash = "";
  flashTics = 0;

  constructor(mo: Mobj | null = null, cheats = 0) {
    this.mo = mo;
    this.cheats = cheats;
    this.cmd = new Ticcmd();
  }

  setMessage(text: string): void {
    this.message = text;
    this.messageTics = 4 * TICRATE;
  }

  static spawnPlayer(world: World, start: MapThing, cheats = 0): Player {
    const x = start.x * FRACUNIT;
    const y = start.y * FRACUNIT;
    const sec = Collision.pointInSubsector(world, x, y).sector!;
    const mo = new Mobj({
      x,
      y,
      z: sec.floorheight,
      angle: asU32(intdiv(start.angle, 45) * 0x20000000),
      floorz: sec.floorheight,
      ceilingz: sec.ceilingheight,
    });
    const p = new Player(mo, cheats);
    mo.player = p;
    if (cheats & 1) mo.flags |= MF_NOCLIP;
    p.viewz = mo.z + VIEWHEIGHT;
    world.mobjs.push(mo);
    return p;
  }

  static thrust(mo: Mobj, angle: number, move: number): void {
    mo.momx += fixedMul(move, fineCos(angle));
    mo.momy += fixedMul(move, fineSin(angle));
  }

  static calcHeight(p: Player, leveltime: number): void {
    const mo = p.mo!;
    p.bob = intdiv(fixedMul(mo.momx, mo.momx) + fixedMul(mo.momy, mo.momy), 4);
    p.bob = Math.min(p.bob, MAXBOB);
    if (mo.z > mo.floorz) {
      p.viewz = Math.min(mo.z + p.viewheight, mo.ceilingz - 4 * FRACUNIT);
      return;
    }
    const angle = (intdiv(FINEANGLES, 20) * leveltime) & FINEMASK;
    const bob = fixedMul(intdiv(p.bob, 2), finesine[angle] ?? 0);
    if (p.playerstate === PST_LIVE) {
      p.viewheight += p.deltaviewheight;
      if (p.viewheight > VIEWHEIGHT) {
        p.viewheight = VIEWHEIGHT;
        p.deltaviewheight = 0;
      }
      if (p.viewheight < intdiv(VIEWHEIGHT, 2)) {
        p.viewheight = intdiv(VIEWHEIGHT, 2);
        if (p.deltaviewheight <= 0) p.deltaviewheight = 1;
      }
      if (p.deltaviewheight) p.deltaviewheight += intdiv(FRACUNIT, 4) || 1;
    }
    p.viewz = Math.min(mo.z + p.viewheight + bob, mo.ceilingz - 4 * FRACUNIT);
  }

  static xyMovement(world: World, mo: Mobj, game: Game): void {
    if (mo.momx === 0 && mo.momy === 0) return;
    Collision.slideMove(world, mo, mo.momx, mo.momy, game);
    if (
      mo.player &&
      Math.abs(mo.momx) < STOPSPEED &&
      Math.abs(mo.momy) < STOPSPEED &&
      mo.player.cmd.forwardmove === 0 &&
      mo.player.cmd.sidemove === 0
    ) {
      mo.momx = mo.momy = 0;
      return;
    }
    mo.momx = fixedMul(mo.momx, FRICTION);
    mo.momy = fixedMul(mo.momy, FRICTION);
  }

  static zMovement(mo: Mobj): void {
    mo.z += mo.momz;
    if (mo.z <= mo.floorz) {
      mo.z = mo.floorz;
      mo.momz = 0;
    } else mo.momz -= GRAVITY;
    if (mo.z + mo.height > mo.ceilingz) {
      mo.z = mo.ceilingz - mo.height;
      mo.momz = 0;
    }
  }

  private static specialSector(world: World, p: Player, game: Game, time: number): void {
    const mo = p.mo!;
    const sec = Collision.pointInSubsector(world, mo.x, mo.y).sector!;
    if (mo.z !== sec.floorheight || !sec.special) return;
    if (sec.special === 9) {
      p.secretcount++;
      sec.special = 0;
      return;
    }
    if ([5, 7, 4, 16, 11].includes(sec.special) && (time & 0x1f) === 0) {
      const damage = sec.special === 7 ? 5 : sec.special === 5 ? 10 : 20;
      game.damageMobj(mo, null, damage);
      if (sec.special === 11 && p.health <= 10 && game.specials) game.specials.exitRequested = true;
    }
  }

  static playerThink(world: World, p: Player, game: Game, leveltime: number): void {
    const mo = p.mo!;
    const cmd = p.cmd;
    if (p.playerstate === PST_DEAD) {
      if (p.viewheight > 6 * FRACUNIT) p.viewheight -= FRACUNIT;
      Player.calcHeight(p, leveltime);
      if (cmd.buttons & BT_USE) {
        p.playerstate = PST_LIVE;
        p.health = mo.health = 100;
        mo.alive = true;
        mo.flags |= MF_SHOOTABLE | MF_SOLID;
      }
      return;
    }
    mo.angle = asU32(mo.angle + (cmd.angleturn << 16));
    if (mo.z <= mo.floorz) {
      if (cmd.forwardmove) Player.thrust(mo, mo.angle, cmd.forwardmove * 2048);
      if (cmd.sidemove) Player.thrust(mo, asU32(mo.angle - ANG90), cmd.sidemove * 2048);
    }
    Player.xyMovement(world, mo, game);
    Player.zMovement(mo);
    Player.calcHeight(p, leveltime);
    Player.specialSector(world, p, game, leveltime);
    if (cmd.buttons & BT_USE) {
      if (!p.usedown) {
        Collision.useLines(world, p, game);
        p.usedown = true;
      }
    } else p.usedown = false;
    if (cmd.buttons & BT_CHANGE) {
      const w = (cmd.buttons & BT_WEAPONMASK) >> BT_WEAPONSHIFT;
      if (w >= 0 && w <= WP_SUPERSHOTGUN && p.weaponowned[w] && w !== p.readyweapon)
        p.pendingweapon = w;
    }
    Player.weaponThink(p, game);
    if (p.damagecount) p.damagecount--;
    if (p.bonuscount) p.bonuscount--;
    if (p.messageTics && --p.messageTics <= 0) p.message = "";
  }

  private static weaponAmmo(): Record<number, number> {
    return Player.WEAPON_AMMO;
  }

  private static weaponPatch(): Record<number, string> {
    return {
      [WP_FIST]: "PUNGA0",
      [WP_PISTOL]: "PISGA0",
      [WP_SHOTGUN]: "SHTGA0",
      [WP_CHAINGUN]: "CHGGA0",
      [WP_MISSILE]: "MISGA0",
      [WP_PLASMA]: "PLSGA0",
      [WP_BFG]: "BFGGA0",
      [WP_CHAINSAW]: "SAWGC0",
      [WP_SUPERSHOTGUN]: "SHT2A0",
    };
  }

  private static attackSequences(): Record<number, AttackStep[]> {
    return {
      [WP_FIST]: [
        ["PUNGB0", 4, 0, "", 0, 0],
        ["PUNGC0", 4, 1, "", 0, 0],
        ["PUNGD0", 5, 0, "", 0, 0],
        ["PUNGC0", 4, 0, "", 0, 0],
        ["PUNGB0", 5, 0, "", 0, 0],
      ],
      [WP_PISTOL]: [
        ["PISGA0", 4, 0, "", 0, 0],
        ["PISGB0", 6, 1, "PISFA0", 7, 1],
        ["PISGC0", 4, 0, "", 0, 0],
        ["PISGB0", 5, 0, "", 0, 0],
      ],
      [WP_SHOTGUN]: [
        ["SHTGA0", 3, 0, "", 0, 0],
        ["SHTGA0", 7, 1, "SHTFA0", 7, 1],
        ["SHTGB0", 5, 0, "", 0, 0],
        ["SHTGC0", 5, 0, "", 0, 0],
        ["SHTGD0", 4, 0, "", 0, 0],
        ["SHTGC0", 5, 0, "", 0, 0],
        ["SHTGB0", 5, 0, "", 0, 0],
        ["SHTGA0", 3, 0, "", 0, 0],
        ["SHTGA0", 7, 0, "", 0, 0],
      ],
      [WP_CHAINGUN]: [
        ["CHGGA0", 4, 1, "CHGFA0", 5, 1],
        ["CHGGB0", 4, 1, "CHGFB0", 5, 2],
      ],
      [WP_MISSILE]: [
        ["MISGB0", 8, 0, "MISFA0", 15, 1],
        ["MISGB0", 12, 1, "", 0, 2],
      ],
      [WP_PLASMA]: [
        ["PLSGA0", 3, 1, "PLSFA0", 4, 1],
        ["PLSGB0", 20, 0, "", 0, 0],
      ],
      [WP_BFG]: [
        ["BFGGA0", 20, 0, "", 0, 0],
        ["BFGGB0", 10, 0, "BFGFA0", 17, 1],
        ["BFGGB0", 10, 1, "", 0, 2],
        ["BFGGB0", 20, 0, "", 0, 0],
      ],
      [WP_CHAINSAW]: [
        ["SAWGA0", 4, 1, "", 0, 0],
        ["SAWGB0", 4, 1, "", 0, 0],
      ],
      [WP_SUPERSHOTGUN]: [
        ["SHT2A0", 3, 0, "", 0, 0],
        ["SHT2A0", 7, 1, "SHT2I0", 9, 1],
        ["SHT2B0", 7, 0, "", 0, 0],
        ["SHT2C0", 7, 0, "", 0, 0],
        ["SHT2D0", 7, 0, "", 0, 0],
        ["SHT2E0", 7, 0, "", 0, 0],
        ["SHT2F0", 7, 0, "", 0, 0],
        ["SHT2G0", 6, 0, "", 0, 0],
        ["SHT2H0", 6, 0, "", 0, 0],
        ["SHT2A0", 5, 0, "", 0, 0],
      ],
    };
  }

  private static weaponThink(p: Player, game: Game): void {
    const firing = (p.cmd.buttons & BT_ATTACK) !== 0;
    const ammoMap = Player.weaponAmmo();
    const ammo = ammoMap[p.readyweapon] ?? null;
    const can = ammo === null || p.ammo[ammo]! > 0;
    if (!can) {
      for (const w of [WP_PISTOL, WP_SHOTGUN, WP_CHAINGUN, WP_MISSILE, WP_PLASMA, WP_BFG, WP_FIST]) {
        const a = ammoMap[w] ?? null;
        if (p.weaponowned[w] && (a === null || p.ammo[a]! > 0)) {
          p.pendingweapon = w;
          break;
        }
      }
    }
    if (p.flashTics > 0 && --p.flashTics <= 0) {
      p.pspriteFlash = "";
      p.extralight = 0;
    }
    if (p.pspriteState === "fire") p.pspriteState = "atk";
    if (p.pspriteState === "atk") {
      if (firing) p.attackdown = true;
      if (p.pspriteTics > 0) p.pspriteTics--;
      if (p.pspriteTics > 0) return;
      p.pspriteStep++;
      Player.enterAttackStep(p, game, ammo, firing, can);
      return;
    }
    if (p.pendingweapon !== WP_NOCHANGE || p.pspriteState === "down") {
      Player.lowerWeapon(p, game);
      return;
    }
    if (p.pspriteState === "up") {
      Player.raiseWeapon(p, game);
      return;
    }
    if (firing && can && (!p.attackdown || ![WP_MISSILE, WP_BFG].includes(p.readyweapon))) {
      p.pspriteState = "atk";
      p.pspriteStep = 0;
      p.pspriteSy = Sprites.WEAPONTOP;
      p.attackdown = true;
      Player.enterAttackStep(p, game, ammo, firing, can);
      return;
    }
    if (p.pspriteState !== "ready") {
      Player.startReady(p, game);
      return;
    }
    Player.tickReady(p, game);
    if (!firing) {
      p.attackdown = false;
      p.refire = 0;
    }
  }

  private static lowerWeapon(p: Player, game: Game): void {
    p.pspriteState = "down";
    const patch = Player.weaponPatch();
    if (!p.pspriteBody) p.pspriteBody = patch[p.readyweapon] ?? "PISGA0";
    p.pspriteSy += Sprites.LOWERSPEED;
    if (p.pspriteSy < Sprites.WEAPONBOTTOM) return;
    p.pspriteSy = Sprites.WEAPONBOTTOM;
    if (p.pendingweapon !== WP_NOCHANGE) {
      p.readyweapon = p.pendingweapon;
      p.pendingweapon = WP_NOCHANGE;
    }
    if (p.readyweapon === WP_CHAINSAW) game.startSound("sawup");
    p.pspriteState = "up";
    p.pspriteBody = patch[p.readyweapon] ?? "PISGA0";
  }

  private static raiseWeapon(p: Player, game: Game): void {
    p.pspriteSy -= Sprites.RAISESPEED;
    const patch = Player.weaponPatch();
    if (!p.pspriteBody) p.pspriteBody = patch[p.readyweapon] ?? "PISGA0";
    if (p.pspriteSy > Sprites.WEAPONTOP) return;
    p.pspriteSy = Sprites.WEAPONTOP;
    Player.startReady(p, game);
  }

  private static startReady(p: Player, game: Game): void {
    p.pspriteState = "ready";
    p.pspriteStep = 0;
    if (p.readyweapon !== WP_CHAINSAW) {
      p.pspriteBody = Player.weaponPatch()[p.readyweapon] ?? "PISGA0";
      p.pspriteTics = 0;
      return;
    }
    p.pspriteBody = "SAWGC0";
    p.pspriteTics = 4;
    game.startSound("sawidl");
  }

  private static tickReady(p: Player, game: Game): void {
    if (p.readyweapon !== WP_CHAINSAW) {
      p.pspriteBody = Player.weaponPatch()[p.readyweapon] ?? "PISGA0";
      return;
    }
    if (p.pspriteTics > 0 && --p.pspriteTics > 0) return;
    p.pspriteStep = (p.pspriteStep + 1) % 2;
    p.pspriteBody = p.pspriteStep ? "SAWGD0" : "SAWGC0";
    p.pspriteTics = 4;
    if (!p.pspriteStep) game.startSound("sawidl");
  }

  private static enterAttackStep(
    p: Player,
    game: Game,
    ammo: number | null,
    firing: boolean,
    can: boolean,
  ): void {
    const seq = Player.attackSequences()[p.readyweapon] ?? Player.attackSequences()[WP_PISTOL]!;
    while (true) {
      if (p.pspriteStep >= seq.length) {
        if (firing && can && p.pendingweapon === WP_NOCHANGE) {
          p.pspriteStep = 0;
          continue;
        }
        Player.startReady(p, game);
        if (!firing) {
          p.attackdown = false;
          p.refire = 0;
        }
        return;
      }
      const [body, tics, fire, flash, ft, light] = seq[p.pspriteStep]!;
      p.pspriteBody = body;
      p.pspriteTics = tics;
      if (ft) {
        p.pspriteFlash = flash;
        p.flashTics = ft;
      }
      if (light) p.extralight = light;
      if (fire) Player.doShot(p, game, ammo);
      if (tics > 0) return;
      p.pspriteStep++;
    }
  }

  private static doShot(p: Player, game: Game, ammo: number | null): void {
    if (ammo !== null) {
      if (p.ammo[ammo]! <= 0) return;
      p.ammo[ammo]!--;
    }
    const shots: Record<number, [number, number, string | null]> = {
      [WP_FIST]: [2, MELEERANGE, null],
      [WP_CHAINSAW]: [3, MELEERANGE, "sawful"],
      [WP_PISTOL]: [5, MISSILERANGE, "pistol"],
      [WP_SHOTGUN]: [7, MISSILERANGE, "shotgn"],
      [WP_SUPERSHOTGUN]: [8, MISSILERANGE, "dshtgn"],
      [WP_CHAINGUN]: [5, MISSILERANGE, "pistol"],
      [WP_MISSILE]: [20, MISSILERANGE, "rlaunc"],
      [WP_PLASMA]: [5, MISSILERANGE, "plasma"],
      [WP_BFG]: [100, MISSILERANGE, "bfg"],
    };
    const [dmg, range0, sfx] = shots[p.readyweapon] ?? [5, MISSILERANGE, "pistol"];
    let range = range0;
    let hit = false;
    if (p.mo) {
      const pellets = p.readyweapon === WP_SHOTGUN ? 7 : p.readyweapon === WP_SUPERSHOTGUN ? 20 : 1;
      let shot = dmg * ((game.leveltime & 7) + 1);
      if (p.readyweapon === WP_CHAINSAW) {
        shot = 2 * ((game.leveltime % 10) + 1);
        range = MELEERANGE + 1;
      }
      for (let i = 0; i < pellets; i++)
        if (Collision.lineAttack(game.world!, p.mo, shot, game, range)) hit = true;
    }
    if (p.readyweapon === WP_CHAINSAW) game.startSound(hit ? "sawhit" : "sawful");
    else if (p.readyweapon === WP_FIST) {
      if (hit) game.startSound("punch");
    } else if (sfx) game.startSound(sfx);
    p.refire++;
    p.attackdown = true;
    Enemy.noiseAlert(game.world!, p.mo, game);
  }

  static currentWeaponPatch(p: Player): string {
    if (p.pspriteBody) return p.pspriteBody;
    if (["atk", "fire"].includes(p.pspriteState)) {
      const fire: Record<number, string> = {
        [WP_FIST]: "PUNGC0",
        [WP_PISTOL]: "PISGB0",
        [WP_SHOTGUN]: "SHTGA0",
        [WP_CHAINGUN]: "CHGGB0",
        [WP_MISSILE]: "MISGB0",
        [WP_PLASMA]: "PLSGA0",
        [WP_BFG]: "BFGGB0",
        [WP_CHAINSAW]: "SAWGA0",
        [WP_SUPERSHOTGUN]: "SHT2A0",
      };
      return fire[p.readyweapon] ?? "PISGA0";
    }
    return Player.weaponPatch()[p.readyweapon] ?? "PISGA0";
  }
}

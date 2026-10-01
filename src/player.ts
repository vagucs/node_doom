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
  ANG180,
  BT_ATTACK,
  BT_CHANGE,
  BT_USE,
  BT_WEAPONMASK,
  BT_WEAPONSHIFT,
  FINEANGLES,
  FINEMASK,
  FRACUNIT,
  INFRATICS,
  INVERSECOLORMAP,
  INVISTICS,
  INVULNTICS,
  IRONTICS,
  MAXBOB,
  MAXHEALTH,
  MELEERANGE,
  MF_NOCLIP,
  MF_SHADOW,
  MF_SHOOTABLE,
  MF_SOLID,
  MISSILERANGE,
  PST_DEAD,
  PST_LIVE,
  PST_REBORN,
  PW_INFRARED,
  PW_INVISIBILITY,
  PW_INVULNERABILITY,
  PW_IRONFEET,
  PW_STRENGTH,
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
import { deh, dehString } from "./deh.ts";
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
  attacker: Mobj | null = null;
  extralight = 0;
  fixedcolormap = 0;
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
  powers = [0, 0, 0, 0, 0, 0];

  constructor(mo: Mobj | null = null, cheats = 0) {
    this.mo = mo;
    this.cheats = cheats;
    this.cmd = new Ticcmd();
  }

  setMessage(text: string): void {
    this.message = dehString(text);
    this.messageTics = 4 * TICRATE;
  }

  static givePower(p: Player, power: number): boolean {
    if (power === PW_INVULNERABILITY) {
      p.powers[power] = INVULNTICS;
      return true;
    }
    if (power === PW_INVISIBILITY) {
      p.powers[power] = INVISTICS;
      if (p.mo) p.mo.flags |= MF_SHADOW;
      return true;
    }
    if (power === PW_INFRARED) {
      p.powers[power] = INFRATICS;
      return true;
    }
    if (power === PW_IRONFEET) {
      p.powers[power] = IRONTICS;
      return true;
    }
    if (power === PW_STRENGTH) {
      if (p.health < MAXHEALTH) {
        p.health = Math.min(MAXHEALTH, p.health + 100);
        if (p.mo) p.mo.health = p.health;
      }
      p.powers[power] = 1;
      return true;
    }
    if (p.powers[power]) return false;
    p.powers[power] = 1;
    return true;
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
    p.health = deh.initialHealth;
    mo.health = deh.initialHealth;
    p.ammo = [deh.initialBullets, 0, 0, 0];
    p.maxammo = [...deh.maxammo];
    if (cheats & 1) mo.flags |= MF_NOCLIP;
    p.viewz = mo.z + VIEWHEIGHT;
    mo.lastlook = Enemy.publicRandom() % 4;
    world.mobjs.push(mo);
    Collision.setThingPosition(world, mo);
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
    Enemy.pXyMovement(world, mo, game);
  }

  static zMovement(mo: Mobj, world: World, game: Game): void {
    Enemy.mobjZ(mo, world, game);
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
    if ([5, 7, 4, 16, 11].includes(sec.special)) {
      if (p.powers[PW_IRONFEET]) return;
      if ((time & 0x1f) === 0) {
        const damage = sec.special === 7 ? 5 : sec.special === 5 ? 10 : 20;
        game.damageMobj(mo, null, damage);
        if (sec.special === 11 && p.health <= 10 && game.specials) game.specials.exitRequested = true;
      }
    }
  }

  private static deathThink(world: World, p: Player, game: Game, leveltime: number): void {
    const mo = p.mo!;
    const cmd = p.cmd;
    if (p.viewheight > 6 * FRACUNIT) p.viewheight -= FRACUNIT;
    if (p.viewheight < 6 * FRACUNIT) p.viewheight = 6 * FRACUNIT;
    p.deltaviewheight = 0;
    Player.xyMovement(world, mo, game);
    Player.zMovement(mo, world, game);
    Player.calcHeight(p, leveltime);
    if (p.attacker !== null && p.attacker !== mo) {
      const angle = Collision.angleTo(mo.x, mo.y, p.attacker.x, p.attacker.y);
      const delta = asU32(angle - mo.angle);
      const ang5 = intdiv(ANG90, 18);
      if (delta < asU32(ang5) || delta > asU32(-ang5)) {
        mo.angle = angle;
        if (p.damagecount) p.damagecount--;
      } else if (delta < asU32(ANG180)) mo.angle = asU32(mo.angle + ang5);
      else mo.angle = asU32(mo.angle - ang5);
    } else if (p.damagecount) p.damagecount--;
    Player.weaponThink(p, game);
    if (cmd.buttons & BT_USE) p.playerstate = PST_REBORN;
  }

  static playerThink(world: World, p: Player, game: Game, leveltime: number): void {
    const mo = p.mo!;
    const cmd = p.cmd;
    if (p.playerstate === PST_DEAD) {
      Player.deathThink(world, p, game, leveltime);
      return;
    }
    mo.angle = asU32(mo.angle + (cmd.angleturn << 16));
    if (mo.z <= mo.floorz) {
      if (cmd.forwardmove) Player.thrust(mo, mo.angle, cmd.forwardmove * 2048);
      if (cmd.sidemove) Player.thrust(mo, asU32(mo.angle - ANG90), cmd.sidemove * 2048);
    }
    Player.xyMovement(world, mo, game);
    Player.zMovement(mo, world, game);
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
    if (p.powers[PW_STRENGTH]) p.powers[PW_STRENGTH]! += 1;
    if (p.powers[PW_INVULNERABILITY]) p.powers[PW_INVULNERABILITY]! -= 1;
    if (p.powers[PW_INVISIBILITY]) {
      p.powers[PW_INVISIBILITY]! -= 1;
      if (p.powers[PW_INVISIBILITY] === 0 && p.mo) p.mo.flags &= ~MF_SHADOW;
    }
    if (p.powers[PW_INFRARED]) p.powers[PW_INFRARED]! -= 1;
    if (p.powers[PW_IRONFEET]) p.powers[PW_IRONFEET]! -= 1;
    const inv = p.powers[PW_INVULNERABILITY]!;
    const ir = p.powers[PW_INFRARED]!;
    if (inv) p.fixedcolormap = inv > 4 * 32 || (inv & 8) !== 0 ? INVERSECOLORMAP : 0;
    else if (ir) p.fixedcolormap = ir > 4 * 32 || (ir & 8) !== 0 ? 1 : 0;
    else p.fixedcolormap = 0;
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
    if (p.playerstate === PST_DEAD || p.health <= 0) {
      Player.lowerWeapon(p, game);
      return;
    }
    const firing = (p.cmd.buttons & BT_ATTACK) !== 0;
    const ammoMap = Player.weaponAmmo();
    const ammo = ammoMap[p.readyweapon] ?? null;
    const need = Player.ammoNeeded(p.readyweapon);
    const can = ammo === null || p.ammo[ammo]! >= need;
    if (!can) {
      for (const w of [WP_PISTOL, WP_SHOTGUN, WP_CHAINGUN, WP_MISSILE, WP_PLASMA, WP_BFG, WP_FIST]) {
        const a = ammoMap[w] ?? null;
        if (p.weaponowned[w] && (a === null || p.ammo[a]! >= Player.ammoNeeded(w))) {
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
    if (p.playerstate === PST_DEAD || p.health <= 0) return;
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

  private static ammoNeeded(weapon: number): number {
    return weapon === WP_BFG ? deh.bfgCellsPerShot : 1;
  }

  private static gunShot(p: Player, game: Game, accurate: boolean): boolean {
    const mo = p.mo!;
    const slope = Collision.bulletSlope(game.world!, mo);
    const damage = 5 * ((Enemy.publicRandom() % 3) + 1);
    let angle = mo.angle;
    if (!accurate) angle = asU32(angle + (Enemy.publicRandom() - Enemy.publicRandom()) * 262144);
    return Collision.lineAttack(game.world!, mo, damage, game, MISSILERANGE, angle, slope);
  }

  private static doShot(p: Player, game: Game, ammo: number | null): void {
    const need = Player.ammoNeeded(p.readyweapon);
    if (ammo !== null) {
      if (p.ammo[ammo]! < need) return;
      p.ammo[ammo]! -= need;
    }
    const mo = p.mo;
    const weapon = p.readyweapon;
    let hit = false;
    if (mo && [WP_MISSILE, WP_PLASMA, WP_BFG].includes(weapon)) {
      if (weapon === WP_PLASMA) void (Enemy.publicRandom() & 1);
      if (weapon === WP_MISSILE) {
        Enemy.spawnPlayerMissile(game.world!, mo, "MISL", 20 * FRACUNIT, 20, "rocket");
        game.startSound("rlaunc");
      } else if (weapon === WP_PLASMA) {
        Enemy.spawnPlayerMissile(game.world!, mo, "PLSS", 25 * FRACUNIT, 5, "plasma");
        game.startSound("plasma");
      } else {
        Enemy.spawnPlayerMissile(game.world!, mo, "BFS1", 25 * FRACUNIT, 100, "bfg");
        game.startSound("bfg");
      }
      p.refire++;
      p.attackdown = true;
      Enemy.noiseAlert(game.world!, mo, game);
      return;
    }
    if (mo && weapon === WP_FIST) {
      let damage = ((Enemy.publicRandom() % 10) + 1) * 2;
      if (p.powers[PW_STRENGTH]) damage *= 10;
      const angle = asU32(mo.angle + (Enemy.publicRandom() - Enemy.publicRandom()) * 262144);
      hit = Collision.lineAttack(game.world!, mo, damage, game, MELEERANGE, angle);
      if (hit) game.startSound("punch");
    } else if (mo && weapon === WP_CHAINSAW) {
      const damage = 2 * ((Enemy.publicRandom() % 10) + 1);
      const angle = asU32(mo.angle + (Enemy.publicRandom() - Enemy.publicRandom()) * 262144);
      hit = Collision.lineAttack(game.world!, mo, damage, game, MELEERANGE + 1, angle);
      game.startSound(hit ? "sawhit" : "sawful");
    } else if (mo && weapon === WP_SHOTGUN) {
      game.startSound("shotgn");
      for (let i = 0; i < 7; i++) if (Player.gunShot(p, game, false)) hit = true;
    } else if (mo && weapon === WP_SUPERSHOTGUN) {
      game.startSound("dshtgn");
      const slope = Collision.bulletSlope(game.world!, mo);
      for (let i = 0; i < 20; i++) {
        const damage = 5 * ((Enemy.publicRandom() % 3) + 1);
        const angle = asU32(mo.angle + (Enemy.publicRandom() - Enemy.publicRandom()) * 524288);
        const pellet = slope + (Enemy.publicRandom() - Enemy.publicRandom()) * 32;
        if (Collision.lineAttack(game.world!, mo, damage, game, MISSILERANGE, angle, pellet)) hit = true;
      }
    } else if (mo) {
      game.startSound("pistol");
      Player.gunShot(p, game, p.refire === 0);
    }
    p.refire++;
    p.attackdown = true;
    if (mo) Enemy.noiseAlert(game.world!, mo, game);
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

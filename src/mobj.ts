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
  FRACUNIT,
  IT_BLUECARD,
  IT_BLUESKULL,
  IT_REDCARD,
  IT_REDSKULL,
  IT_YELLOWCARD,
  IT_YELLOWSKULL,
  MAXHEALTH,
  MF_AMBUSH,
  MF_COUNTITEM,
  MF_COUNTKILL,
  MF_DROPOFF,
  MF_FLOAT,
  MF_NOBLOCKMAP,
  MF_NOGRAVITY,
  MF_NOSECTOR,
  MF_PICKUP,
  MF_SPAWNCEILING,
  MF_SHADOW,
  MF_SHOOTABLE,
  MF_SOLID,
  MF_SPECIAL,
  MTF_AMBUSH,
  PW_ALLMAP,
  PW_INFRARED,
  PW_INVISIBILITY,
  PW_INVULNERABILITY,
  PW_IRONFEET,
  PW_STRENGTH,
  SK_EASY,
  SK_HARD,
  SK_NIGHTMARE,
  WP_BFG,
  WP_CHAINGUN,
  WP_CHAINSAW,
  WP_FIST,
  WP_MISSILE,
  WP_PLASMA,
  WP_SHOTGUN,
  WP_SUPERSHOTGUN,
} from "./defs.ts";
import type { Game } from "./game.ts";
import { deh } from "./deh.ts";
import { Enemy } from "./enemy.ts";
import { MI_FLAGS, MOBJINFO, MT_SKULL, mobjTypeForDoomednum } from "./info.ts";
import { ONCEILINGZ, ONFLOORZ, Thinker } from "./thinker.ts";
import { Player } from "./player.ts";
import type { MapThing, World } from "./world.ts";

export interface MobjOpts {
  x?: number;
  y?: number;
  z?: number;
  angle?: number;
  momx?: number;
  momy?: number;
  momz?: number;
  radius?: number;
  height?: number;
  floorz?: number;
  ceilingz?: number;
  flags?: number;
  health?: number;
  player?: Player | null;
  type?: number;
  sprite?: string;
  info?: unknown[] | null;
  alive?: boolean;
  reactiontime?: number;
  lastlook?: number;
  target?: Mobj | null;
  movedir?: number;
  movecount?: number;
  aiState?: string;
  frame?: number;
  tics?: number;
  chaseTics?: number;
  justAttacked?: boolean;
  damage?: number;
  missileKind?: string;
  tracer?: Mobj | null;
}

type InfoEntry = [string, number, number, number, number, string, unknown];

export class Mobj {
  private static cachedInfo: Record<number, InfoEntry> | null = null;
  x: number;
  y: number;
  z: number;
  angle: number;
  momx: number;
  momy: number;
  momz: number;
  radius: number;
  height: number;
  floorz: number;
  ceilingz: number;
  flags: number;
  health: number;
  player: Player | null;
  type: number;
  sprite: string;
  info: unknown[] | null;
  alive: boolean;
  reactiontime: number;
  lastlook: number;
  target: Mobj | null;
  movedir: number;
  movecount: number;
  aiState: string;
  frame: number;
  tics: number;
  chaseTics: number;
  justAttacked: boolean;
  damage: number;
  tmx: number;
  tmy: number;
  pickup: Mobj | null = null;
  attackKind = "hitscan";
  didFire = false;
  missileKind = "";
  tracer: Mobj | null = null;
  easySkip = false;
  istate = 0;
  spawnpoint: unknown = null;
  doomednum = -1;
  bnext: Mobj | null = null;
  bprev: Mobj | null = null;
  blocklinked = false;
  bindex = -1;

  constructor(opts: MobjOpts = {}) {
    this.x = opts.x ?? 0;
    this.y = opts.y ?? 0;
    this.z = opts.z ?? 0;
    this.angle = opts.angle ?? 0;
    this.momx = opts.momx ?? 0;
    this.momy = opts.momy ?? 0;
    this.momz = opts.momz ?? 0;
    this.radius = opts.radius ?? 16 * FRACUNIT;
    this.height = opts.height ?? 56 * FRACUNIT;
    this.floorz = opts.floorz ?? 0;
    this.ceilingz = opts.ceilingz ?? 0;
    this.flags = opts.flags ?? MF_SOLID | MF_SHOOTABLE | MF_PICKUP | MF_DROPOFF;
    this.health = opts.health ?? 100;
    this.player = opts.player ?? null;
    this.type = opts.type ?? 1;
    this.sprite = opts.sprite ?? "";
    this.info = opts.info ?? null;
    this.alive = opts.alive ?? true;
    this.reactiontime = opts.reactiontime ?? 0;
    this.lastlook = opts.lastlook ?? 0;
    this.target = opts.target ?? null;
    this.movedir = opts.movedir ?? 8;
    this.movecount = opts.movecount ?? 0;
    this.aiState = opts.aiState ?? "";
    this.frame = opts.frame ?? 0;
    this.tics = opts.tics ?? 0;
    this.chaseTics = opts.chaseTics ?? 0;
    this.justAttacked = opts.justAttacked ?? false;
    this.damage = opts.damage ?? 0;
    this.missileKind = opts.missileKind ?? "";
    this.tracer = opts.tracer ?? null;
    this.tmx = this.x;
    this.tmy = this.y;
  }

  static infoTable(): Record<number, InfoEntry> {
    if (Mobj.cachedInfo) return Mobj.cachedInfo;
    const enemy = MF_SOLID | MF_SHOOTABLE;
    const special = MF_SPECIAL;
    const solid = MF_SOLID;
    Mobj.cachedInfo = {
      3004: ["POSSA1", 20, 56, 20, enemy, "enemy", "posit1"],
      9: ["SPOSA1", 20, 56, 30, enemy, "enemy", "posit1"],
      3001: ["TROOA1", 20, 56, 60, enemy, "enemy", "bgsit1"],
      3002: ["SARGA1", 30, 56, 150, enemy, "enemy", "sgtsit"],
      58: ["SARGA1", 30, 56, 150, enemy | MF_SHADOW, "enemy", "sgtsit"],
      65: ["CPOSA1", 20, 56, 70, enemy, "enemy", "posit2"],
      3003: ["BOSSA1", 24, 64, 1000, enemy, "enemy", "brssit"],
      3005: ["HEADA1", 31, 56, 400, enemy | MF_FLOAT | MF_NOGRAVITY, "enemy", "cacsit"],
      3006: ["SKULA1", 16, 56, 100, enemy | MF_FLOAT | MF_NOGRAVITY, "enemy", "sklatk"],
      16: ["CYBRA1", 40, 110, 4000, enemy, "enemy", "cybsit"],
      7: ["SPIDA1", 128, 100, 3000, enemy, "enemy", "spisit"],
      68: ["BSPIA1", 64, 64, 500, enemy, "enemy", "bspsit"],
      69: ["BOS2A1", 24, 64, 500, enemy, "enemy", "kntsit"],
      64: ["VILEA1", 20, 56, 700, enemy, "enemy", "vilsit"],
      66: ["SKELA1", 20, 56, 500, enemy, "enemy", "skesit"],
      67: ["FATTA1", 48, 64, 600, enemy, "enemy", "mansit"],
      71: ["PAINA1", 31, 56, 400, enemy | MF_FLOAT | MF_NOGRAVITY, "enemy", "pesit"],
      84: ["SSWVA1", 20, 56, 50, enemy, "enemy", "posit1"],
      72: ["KEENA1", 16, 72, 100, enemy | MF_NOGRAVITY, "enemy", "keenpn"],
      87: ["", 20, 32, 1000, MF_NOBLOCKMAP | MF_NOSECTOR, "bosstarget", null],
      88: ["BBRNA1", 16, 16, 250, enemy, "enemy", "bossit"],
      89: ["", 20, 32, 1000, MF_NOBLOCKMAP | MF_NOSECTOR, "braineye", null],
      2035: ["BAR1A0", 10, 42, 20, enemy, "enemy", null],
      2011: ["STIMA0", 20, 16, 0, special, "health", 10],
      2012: ["MEDIA0", 20, 16, 0, special, "health", 25],
      2014: ["BON1A0", 20, 16, 0, special, "bonus_h", 1],
      2015: ["BON2A0", 20, 16, 0, special, "bonus_a", 1],
      2018: ["ARM1A0", 20, 16, 0, special, "armor", 1],
      2019: ["ARM2A0", 20, 16, 0, special, "armor", 2],
      83: ["MEGAA0", 20, 16, 0, special, "mega", 0],
      2013: ["SOULA0", 20, 16, 0, special, "soul", 0],
      2022: ["PINVA0", 20, 16, 0, special, "item", "Invulnerability"],
      2023: ["PSTRA0", 20, 16, 0, special, "berserk", 0],
      2024: ["PINSA0", 20, 16, 0, special, "item", "Partial invisibility"],
      2025: ["SUITA0", 20, 16, 0, special, "item", "Radiation shielding"],
      2026: ["PMAPA0", 20, 16, 0, special, "item", "Computer area map"],
      2045: ["PVISA0", 20, 16, 0, special, "item", "Light amplification visor"],
      5: ["BKEYA0", 20, 16, 0, special, "key", IT_BLUECARD],
      6: ["YKEYA0", 20, 16, 0, special, "key", IT_YELLOWCARD],
      13: ["RKEYA0", 20, 16, 0, special, "key", IT_REDCARD],
      40: ["BSKUA0", 20, 16, 0, special, "key", IT_BLUESKULL],
      39: ["YSKUA0", 20, 16, 0, special, "key", IT_YELLOWSKULL],
      38: ["RSKUA0", 20, 16, 0, special, "key", IT_REDSKULL],
      2001: ["SHOTA0", 20, 16, 0, special, "weapon", WP_SHOTGUN],
      82: ["SGN2A0", 20, 16, 0, special, "weapon", WP_SUPERSHOTGUN],
      2002: ["MGUNA0", 20, 16, 0, special, "weapon", WP_CHAINGUN],
      2003: ["LAUNA0", 20, 16, 0, special, "weapon", WP_MISSILE],
      2004: ["PLASA0", 20, 16, 0, special, "weapon", WP_PLASMA],
      2005: ["CSAWA0", 20, 16, 0, special, "weapon", WP_CHAINSAW],
      2006: ["BFUGA0", 20, 16, 0, special, "weapon", WP_BFG],
      2007: ["CLIPA0", 20, 16, 0, special, "ammo", [AM_CLIP, 1]],
      2048: ["AMMOA0", 20, 16, 0, special, "ammo", [AM_CLIP, 5]],
      2008: ["SHELA0", 20, 16, 0, special, "ammo", [AM_SHELL, 1]],
      2049: ["SBOXA0", 20, 16, 0, special, "ammo", [AM_SHELL, 5]],
      2047: ["CELLA0", 20, 16, 0, special, "ammo", [AM_CELL, 1]],
      17: ["CELPA0", 20, 16, 0, special, "ammo", [AM_CELL, 5]],
      2010: ["ROCKA0", 20, 16, 0, special, "ammo", [AM_MISL, 1]],
      2046: ["BROKA0", 20, 16, 0, special, "ammo", [AM_MISL, 5]],
      8: ["BPAKA0", 20, 16, 0, special, "backpack", 0],
      2028: ["COLUA0", 16, 16, 0, solid, "deco", null],
      85: ["TLMPA0", 16, 16, 0, solid, "deco", null],
      86: ["TLP2A0", 16, 16, 0, solid, "deco", null],
      48: ["ELECA0", 16, 16, 0, solid, "deco", null],
      30: ["COL1A0", 16, 16, 0, solid, "deco", null],
      31: ["COL2A0", 16, 16, 0, solid, "deco", null],
      32: ["COL3A0", 16, 16, 0, solid, "deco", null],
      33: ["COL4A0", 16, 16, 0, solid, "deco", null],
      35: ["CANDA0", 16, 16, 0, 0, "deco", null],
      37: ["CBRAA0", 16, 16, 0, solid, "deco", null],
      41: ["CEYEA0", 16, 16, 0, solid, "deco", null],
      42: ["FSKUA0", 16, 16, 0, solid, "deco", null],
      43: ["TRE1A0", 16, 16, 0, solid, "deco", null],
      47: ["SMITA0", 16, 16, 0, solid, "deco", null],
      54: ["TRE2A0", 32, 16, 0, solid, "deco", null],
      10: ["PLAYW0", 16, 16, 0, 0, "deco", null],
      12: ["PLAYW0", 16, 16, 0, 0, "deco", null],
      15: ["PLAYN0", 16, 16, 0, 0, "deco", null],
      24: ["POL5A0", 16, 16, 0, 0, "deco", null],
      25: ["POL1A0", 16, 16, 0, solid, "deco", null],
      26: ["POL6A0", 16, 16, 0, solid, "deco", null],
      27: ["POL4A0", 16, 16, 0, solid, "deco", null],
      28: ["POL2A0", 16, 16, 0, solid, "deco", null],
      34: ["CANDA0", 16, 16, 0, 0, "deco", null],
      14: ["TFOGA0", 20, 16, 0, 0, "teleport", null],
      36: ["CBRAA0", 16, 16, 0, solid, "deco", null],
      46: ["TREDA0", 16, 16, 0, 0, "deco", null],
      55: ["GOR1A0", 16, 16, 0, 0, "deco", null],
      56: ["GOR2A0", 16, 16, 0, 0, "deco", null],
      57: ["GOR3A0", 16, 16, 0, 0, "deco", null],
      59: ["GOR5A0", 16, 16, 0, 0, "deco", null],
    };
    return Mobj.cachedInfo;
  }

  static skillBit(skill: number): number {
    if (skill <= SK_EASY) return 1;
    return skill === SK_NIGHTMARE || skill >= SK_HARD ? 4 : 2;
  }

  static spawnMapThings(
    world: World,
    skill: number,
    game?: { nomonsters?: boolean; player: Player | null } | null,
  ): [number, number] {
    const bit = Mobj.skillBit(skill);
    let kills = 0;
    let items = 0;
    const table = Mobj.infoTable();
    const nomonsters = Boolean(game?.nomonsters);
    for (const mt of world.things) {
      if (mt.type === 11) continue;
      if (mt.type === 1 || mt.type === 2 || mt.type === 3 || mt.type === 4) {
        if (mt.type === 1 && game != null && game.player == null) game.player = Player.spawnPlayer(world, mt);
        continue;
      }
      if (!(mt.options & bit) || mt.options & 16) continue;
      const typ = mobjTypeForDoomednum(mt.type);
      if (typ < 0) continue;
      const flags = Number(MOBJINFO[typ][MI_FLAGS]);
      if (nomonsters && ((flags & MF_COUNTKILL) || typ === MT_SKULL)) continue;
      const z = flags & MF_SPAWNCEILING ? ONCEILINGZ : ONFLOORZ;
      const mo = Thinker.spawnMobj(world, mt.x * FRACUNIT, mt.y * FRACUNIT, z, typ, game as never);
      if (mo.tics > 0) mo.tics = 1 + (Enemy.publicRandom() % mo.tics);
      mo.angle = asU32(intdiv(mt.angle, 45) * 0x20000000);
      mo.spawnpoint = mt;
      if (mt.options & MTF_AMBUSH) mo.flags |= MF_AMBUSH;
      const pickup = table[mt.type];
      if (pickup) mo.info = [pickup[5], pickup[6]];
      if (mo.flags & MF_COUNTKILL) kills++;
      if (mo.flags & MF_COUNTITEM) items++;
    }
    return [kills, items];
  }

  static giveAmmo(p: Player, ammo: number, num: number): boolean {
    if (p.ammo[ammo]! >= p.maxammo[ammo]!) return false;
    p.ammo[ammo] = Math.min(p.maxammo[ammo]!, p.ammo[ammo]! + Player.CLIPAMMO[ammo]! * num);
    return true;
  }

  static touchSpecial(game: Game, special: Mobj, toucher: Mobj): void {
    const p = toucher.player;
    if (p === null || !special.alive) return;
    const [kind, extra] = (special.info ?? ["deco", null]) as [string, unknown];
    let taken = true;
    let sfx = "itemup";
    if (kind === "health") {
      if (p.health >= MAXHEALTH) taken = false;
      else {
        p.health = Math.min(MAXHEALTH, p.health + (extra as number));
        p.mo!.health = p.health;
        p.setMessage(extra === 10 ? "Picked up a stimpack." : "Picked up a medikit.");
      }
    } else if (kind === "bonus_h") {
      p.health = Math.min(200, p.health + 1);
      p.mo!.health = p.health;
      p.setMessage("You pick up a health bonus.");
    } else if (kind === "bonus_a") {
      p.armorpoints = Math.min(200, p.armorpoints + 1);
      if (!p.armortype) p.armortype = 1;
      p.setMessage("You pick up an armor bonus.");
    } else if (kind === "armor") {
      const points = extra === 1 ? 100 : 200;
      if (p.armorpoints >= points) taken = false;
      else {
        p.armorpoints = points;
        p.armortype = extra as number;
        p.setMessage(extra === 1 ? "Picked up the armor." : "Picked up the MegaArmor!");
      }
    } else if (kind === "soul") {
      p.health = Math.min(200, p.health + 100);
      p.mo!.health = p.health;
      p.setMessage("Supercharge!");
    } else if (kind === "mega") {
      p.health = p.mo!.health = 200;
      p.armorpoints = 200;
      p.armortype = 2;
      p.setMessage("MegaSphere!");
    } else if (kind === "berserk") {
      taken = Player.givePower(p, PW_STRENGTH);
      if (taken) {
        if (p.readyweapon !== WP_FIST) p.pendingweapon = WP_FIST;
        p.setMessage("Berserk!");
        sfx = "getpow";
      }
    } else if (kind === "key") {
      p.cards[extra as number] = true;
      const names: Record<number, string> = {
        [IT_BLUECARD]: "You picked up a blue keycard.",
        [IT_YELLOWCARD]: "You picked up a yellow keycard.",
        [IT_REDCARD]: "You picked up a red keycard.",
        [IT_BLUESKULL]: "You picked up a blue skull key.",
        [IT_YELLOWSKULL]: "You picked up a yellow skull key.",
        [IT_REDSKULL]: "You picked up a red skull key.",
      };
      p.setMessage(names[extra as number] ?? "You picked up a key.");
    } else if (kind === "weapon") {
      const w = extra as number;
      p.weaponowned[w] = true;
      if (p.readyweapon !== w) p.pendingweapon = w;
      if ([WP_SHOTGUN, WP_SUPERSHOTGUN].includes(w)) Mobj.giveAmmo(p, AM_SHELL, 1);
      else if (w === WP_CHAINGUN) Mobj.giveAmmo(p, AM_CLIP, 1);
      else if (w === WP_MISSILE) Mobj.giveAmmo(p, AM_MISL, 1);
      else if ([WP_PLASMA, WP_BFG].includes(w)) Mobj.giveAmmo(p, AM_CELL, 1);
      const names: Record<number, string> = {
        [WP_SHOTGUN]: "You got the shotgun!",
        [WP_SUPERSHOTGUN]: "You got the super shotgun!",
        [WP_CHAINGUN]: "You got the chaingun!",
        [WP_MISSILE]: "You got the rocket launcher!",
        [WP_PLASMA]: "You got the plasma gun!",
        [WP_BFG]: "You got the BFG9000!",
        [WP_CHAINSAW]: "A chainsaw!  Find some meat!",
      };
      p.setMessage(names[w] ?? "You got a weapon!");
      game.startSound("wpnup");
    } else if (kind === "ammo") {
      const [ammo, num] = extra as [number, number];
      taken = Mobj.giveAmmo(p, ammo, num);
      if (taken) p.setMessage("Picked up some ammo.");
    } else if (kind === "backpack") {
      for (let i = 0; i < 4; i++) {
        if (p.maxammo[i]! < 400) p.maxammo[i]! *= 2;
        Mobj.giveAmmo(p, i, 1);
      }
      p.setMessage("You picked up a backpack full of ammo!");
    } else if (kind === "item") {
      const powers: Record<string, [number, string]> = {
        Invulnerability: [PW_INVULNERABILITY, "Invulnerability!"],
        "Partial invisibility": [PW_INVISIBILITY, "Partial Invisibility"],
        "Radiation shielding": [PW_IRONFEET, "Radiation Shielding Suit"],
        "Computer area map": [PW_ALLMAP, "Computer Area Map"],
        "Light amplification visor": [PW_INFRARED, "Light Amplification Visor"],
      };
      const pair = powers[String(extra)];
      if (!pair) p.setMessage(String(extra));
      else {
        taken = Player.givePower(p, pair[0]);
        if (taken) {
          p.setMessage(pair[1]);
          sfx = "getpow";
        }
      }
    } else {
      taken = false;
    }
    if (taken) {
      if (kind !== "weapon") game.startSound(sfx);
      p.bonuscount += 6;
      if (special.flags & MF_COUNTITEM) p.itemcount++;
      special.alive = false;
      special.flags = 0;
      const i = game.world!.mobjs.indexOf(special);
      if (i !== -1) game.world!.mobjs.splice(i, 1);
    }
  }
}

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
import { asI32, asU32, fixedMul, intdiv, shar } from "./compat.ts";
import {
  ANG45,
  ANG90,
  ANG270,
  CF_NOMOMENTUM,
  FRICTION,
  FRACUNIT,
  GRAVITY,
  MAXMOVE,
  MELEERANGE,
  MF_AMBUSH,
  MF_CORPSE,
  MF_COUNTKILL,
  MF_DROPPED,
  MF_DROPOFF,
  MF_FLOAT,
  MF_INFLOAT,
  MF_JUSTATTACKED,
  MF_JUSTHIT,
  MF_MISSILE,
  MF_NOCLIP,
  MF_NOGRAVITY,
  MF_SHADOW,
  MF_SHOOTABLE,
  MF_SKULLFLY,
  MF_SOLID,
  MISSILERANGE,
  VIEWHEIGHT,
  SK_EASY,
  SK_NIGHTMARE,
  SKULLSPEED,
  STOPSPEED,
  ML_SOUNDBLOCK,
  ML_TWOSIDED,
  VLD_BLAZEOPEN,
} from "./defs.ts";
import type { Game } from "./game.ts";
import {
  MI_ACTIVESOUND,
  MI_ATTACKSOUND,
  MI_DAMAGE,
  MI_DEATHSOUND,
  MI_DEATHSTATE,
  MI_FLAGS,
  MI_HEIGHT,
  MI_MELEESTATE,
  MI_MISSILESTATE,
  MI_PAINSTATE,
  MI_PAINSOUND,
  MI_RADIUS,
  MI_RAISESTATE,
  MI_SEESOUND,
  MI_SEESTATE,
  MI_SPAWNHEALTH,
  MI_SPAWNSTATE,
  MI_SPEED,
  MI_XDEATHSTATE,
  MOBJINFO,
  MT_ARACHPLAZ,
  MT_BABY,
  MT_BARREL,
  MT_BFG,
  MT_BOSSTARGET,
  MT_BRUISER,
  MT_BRUISERSHOT,
  MT_CHAINGUN,
  MT_CHAINGUY,
  MT_CLIP,
  MT_CYBORG,
  MT_FATSHOT,
  MT_FATSO,
  MT_FIRE,
  MT_HEAD,
  MT_HEADSHOT,
  MT_KEEN,
  MT_KNIGHT,
  MT_PAIN,
  MT_PLASMA,
  MT_POSSESSED,
  MT_ROCKET,
  MT_SERGEANT,
  MT_SHOTGUN,
  MT_SHOTGUY,
  MT_SHADOWS,
  MT_SKULL,
  MT_SPAWNSHOT,
  MT_SPIDER,
  MT_TRACER,
  MT_TROOP,
  MT_TROOPSHOT,
  MT_UNDEAD,
  MT_VILE,
  S_PLAY,
  S_PLAY_RUN1,
  S_VILE_HEAL1,
} from "./info.ts";
import { Mobj } from "./mobj.ts";
import { Specials } from "./specials.ts";
import { fineCos, fineSin } from "./tables.ts";
import { ONFLOORZ, Thinker } from "./thinker.ts";
import type { Sector, World } from "./world.ts";

type Profile = [number, string, string | null, string | null, string | null, number, number, number];

export class Enemy {
  private static readonly DI_EAST = 0;
  private static readonly DI_NE = 1;
  private static readonly DI_NORTH = 2;
  private static readonly DI_NW = 3;
  private static readonly DI_WEST = 4;
  private static readonly DI_SW = 5;
  private static readonly DI_SOUTH = 6;
  private static readonly DI_SE = 7;
  private static readonly DI_NODIR = 8;
  private static readonly XSPEED = [FRACUNIT, 47000, 0, -47000, -FRACUNIT, -47000, 0, 47000];
  private static readonly YSPEED = [0, 47000, FRACUNIT, 47000, 0, -47000, -FRACUNIT, -47000];
  private static readonly OPPOSITE = [4, 5, 6, 7, 0, 1, 2, 3, 8];
  private static readonly DIAGS = [Enemy.DI_NW, Enemy.DI_NE, Enemy.DI_SW, Enemy.DI_SE];
  // P_Random increments first, so index 0 is never the first draw.
  private static readonly RNDTABLE = [
    0, 8, 109, 220, 222, 241, 149, 107, 75, 248, 254, 140, 16, 66,
    74, 21, 211, 47, 80, 242, 154, 27, 205, 128, 161, 89, 77, 36,
    95, 110, 85, 48, 212, 140, 211, 249, 22, 79, 200, 50, 28, 188,
    52, 140, 202, 120, 68, 145, 62, 70, 184, 190, 91, 197, 152, 224,
    149, 104, 25, 178, 252, 182, 202, 182, 141, 197, 4, 81, 181, 242,
    145, 42, 39, 227, 156, 198, 225, 193, 219, 93, 122, 175, 249, 0,
    175, 143, 70, 239, 46, 246, 163, 53, 163, 109, 168, 135, 2, 235,
    25, 92, 20, 145, 138, 77, 69, 166, 78, 176, 173, 212, 166, 113,
    94, 161, 41, 50, 239, 49, 111, 164, 70, 60, 2, 37, 171, 75,
    136, 156, 11, 56, 42, 146, 138, 229, 73, 146, 77, 61, 98, 196,
    135, 106, 63, 197, 195, 86, 96, 203, 113, 101, 170, 247, 181, 113,
    80, 250, 108, 7, 255, 237, 129, 226, 79, 107, 112, 166, 103, 241,
    24, 223, 239, 120, 198, 58, 60, 82, 128, 3, 184, 66, 143, 224,
    145, 224, 81, 206, 163, 45, 63, 90, 168, 114, 59, 33, 159, 95,
    28, 139, 123, 98, 125, 196, 15, 70, 194, 253, 54, 14, 109, 226,
    71, 17, 161, 93, 186, 87, 244, 138, 20, 52, 123, 251, 26, 36,
    17, 46, 52, 231, 232, 76, 31, 221, 84, 37, 216, 165, 212, 106,
    197, 242, 98, 43, 39, 175, 254, 145, 190, 84, 118, 222, 187, 136,
    120, 163, 236, 249,
  ];
  private static prndindex = 0;

  static {
    if (Enemy.RNDTABLE.length !== 256) throw new Error("RNDTABLE length");
  }

  private static profiles(): Record<number, Profile> {
    return {
      3004: [8, "hitscan", "posit1", "podth1", "pistol", 7, 5, 4],
      9: [8, "shotgun", "posit2", "podth2", "shotgn", 7, 5, 3],
      3001: [8, "imp", "bgsit1", "bgdth1", "claw", 7, 6, 3],
      3002: [10, "melee", "sgtsit", "sgtdth", "sgtatk", 7, 6, 2],
      58: [10, "melee", "sgtsit", "sgtdth", "sgtatk", 7, 6, 2],
      3003: [8, "baron", "brssit", "brsdth", "claw", 7, 7, 3],
      3005: [8, "caco", "cacsit", "cacdth", "claw", 5, 6, 3],
      3006: [8, "skull", "sklatk", "firxpl", "sklatk", 5, 6, 3],
      16: [16, "rocket", "cybsit", "cybdth", "rlaunc", 5, 9, 3],
      7: [12, "spider", "spisit", "spidth", "shotgn", 5, 10, 3],
      68: [12, "plasma", "bspsit", "bspdth", "plasma", 5, 7, 3],
      65: [8, "chaingun", "posit2", "podth2", "shotgn", 7, 7, 3],
      69: [8, "baron", "kntsit", "kntdth", "claw", 7, 7, 3],
      84: [8, "hitscan", "posit1", "podth1", "pistol", 7, 5, 3],
      64: [15, "vile", "vilsit", "vildth", "vilatk", 7, 9, 2],
      66: [10, "revenant", "skesit", "skedth", "skeswg", 7, 5, 2],
      67: [8, "mancubus", "mansit", "mandth", "manatk", 7, 7, 3],
      71: [8, "pain", "pesit", "pedth", "pesit", 5, 6, 3],
      72: [0, "keen", "keenpn", "keendt", null, 0, 6, 4],
      88: [0, "brain", "bossit", "bosdth", null, 0, 3, 4],
      2035: [0, "none", null, "barexp", null, 0, 5, 4],
    };
  }

  private static readonly FLOATSPEED = 4 * FRACUNIT;
  private static readonly TRACEANGLE = 0xc000000;
  private static readonly FATSPREAD = Math.trunc(ANG90 / 8);
  private static brainTargetOn = 0;

  static clearRandom(): void {
    Enemy.prndindex = 0;
  }

  static random(): number {
    Enemy.prndindex = (Enemy.prndindex + 1) & 255;
    return Enemy.RNDTABLE[Enemy.prndindex]!;
  }

  private static walkTics(mo: Mobj): number {
    return Enemy.profiles()[mo.type]?.[7] ?? 3;
  }

  static tickEnemies(world: World, game: Game): void {
    const p = game.player;
    if (!p || !p.mo) return;
    for (const mo of [...world.mobjs]) {
      if (mo === p.mo) continue;
      Thinker.mobjThinker(world, mo, game);
    }
  }

  private static tickStand(mo: Mobj): void {
    if (mo.tics > 0) {
      --mo.tics;
      return;
    }
    mo.frame = (mo.frame + 1) % (mo.type === MT_HEAD ? 1 : 2);
    mo.tics = 10;
  }

  static killMonster(mo: Mobj, game: Game, source: Mobj | null): void {
    const info = MOBJINFO[mo.type];
    mo.flags &= ~(MF_SHOOTABLE | MF_FLOAT | MF_SKULLFLY);
    mo.flags |= MF_CORPSE | MF_DROPOFF;
    mo.height >>= 2;
    if (source?.player && (mo.flags & MF_COUNTKILL)) ++source.player.killcount;
    const xdeath = Number(info[MI_XDEATHSTATE]);
    const state =
      mo.health < -Number(info[MI_SPAWNHEALTH]) && xdeath ? xdeath : Number(info[MI_DEATHSTATE]);
    Thinker.setMobjState(mo, state, game.world!, game);
    if (mo.alive) {
      mo.tics -= Enemy.random() & 3;
      if (mo.tics < 1) mo.tics = 1;
      const drop =
        mo.type === MT_POSSESSED
          ? MT_CLIP
          : mo.type === MT_SHOTGUY
            ? MT_SHOTGUN
            : mo.type === MT_CHAINGUY
              ? MT_CHAINGUN
              : 0;
      if (drop) {
        const item = Thinker.spawnMobj(game.world!, mo.x, mo.y, ONFLOORZ, drop, game);
        item.flags |= MF_DROPPED;
      }
    }
  }

  private static tickDead(world: World, mo: Mobj, game: Game): void {
    if (mo.aiState !== "die") return;
    if (mo.tics > 0) {
      --mo.tics;
      return;
    }
    const prof = Enemy.profiles()[mo.type] ?? null;
    let d0: number;
    let dn: number;
    if (prof) {
      d0 = prof[5];
      dn = prof[6];
    } else {
      d0 = 7;
      dn = 5;
    }
    if (mo.sprite === "BEXP") {
      d0 = 0;
      dn = 5;
    }
    if (mo.frame + 1 < d0 + dn) {
      ++mo.frame;
      mo.tics = 5;
      return;
    }
    mo.aiState = "dead";
    if (mo.type === MT_KEEN) Enemy.keenDie(world, mo, game);
    else if ([MT_FATSO, MT_BABY, MT_BRUISER, MT_CYBORG, MT_SPIDER].includes(mo.type)) {
      Enemy.bossDeath(world, mo, game);
    }
    if (mo.sprite === "BEXP") {
      const i = world.mobjs.indexOf(mo);
      if (i !== -1) world.mobjs.splice(i, 1);
    }
  }

  static noiseAlert(world: World, emitter: Mobj | null, _game: Game | null = null): void {
    if (!emitter) return;
    const sec = Collision.pointInSubsector(world, emitter.x, emitter.y).sector!;
    ++world.validcount;
    Enemy.recursiveSound(world, sec, 0, emitter);
  }

  private static recursiveSound(world: World, sec: Sector, blocks: number, target: Mobj): void {
    if (sec.validcount === world.validcount && sec.soundtraversed <= blocks + 1) return;
    sec.validcount = world.validcount;
    sec.soundtraversed = blocks + 1;
    sec.soundtarget = target;
    for (const ln of sec.lines) {
      if (!(ln.flags & ML_TWOSIDED)) continue;
      const [top, bottom] = Collision.lineOpening(ln);
      if (top - bottom <= 0) continue;
      const other = ln.frontsector === sec ? ln.backsector : ln.frontsector;
      if (!other) continue;
      if (ln.flags & ML_SOUNDBLOCK) {
        if (blocks === 0) Enemy.recursiveSound(world, other, 1, target);
      } else {
        Enemy.recursiveSound(world, other, blocks, target);
      }
    }
  }

  private static look(world: World, mo: Mobj, player: Mobj, game: Game): void {
    let see = false;
    const sec = Collision.pointInSubsector(world, mo.x, mo.y).sector!;
    const target = sec.soundtarget;
    if (target && target.flags & MF_SHOOTABLE) {
      mo.target = target;
      see = mo.flags & MF_AMBUSH ? Collision.checkSight(world, mo, target) : true;
    }
    if (!see && !Enemy.lookForPlayer(world, mo, player, false)) return;
    mo.movedir = Enemy.DI_NODIR;
    mo.movecount = 0;
    let sound = String(MOBJINFO[mo.type][MI_SEESOUND] ?? "");
    if (sound === "posit1") sound = ["posit1", "posit2", "posit3"][Enemy.random() % 3]!;
    else if (sound === "bgsit1") sound = ["bgsit1", "bgsit2"][Enemy.random() % 2]!;
    if (sound) game.startSound(sound);
    Thinker.setMobjState(mo, Number(MOBJINFO[mo.type][MI_SEESTATE]), world, game);
  }

  private static lookForPlayer(world: World, mo: Mobj, p: Mobj | null, allaround: boolean): boolean {
    if (!p) return false;
    let c = 0;
    const stop = (mo.lastlook - 1) & 3;
    while (true) {
      if (mo.lastlook !== 0) {
        mo.lastlook = (mo.lastlook + 1) & 3;
        continue;
      }
      if (c === 2 || mo.lastlook === stop) return false;
      c++;
      if (p.health <= 0 || !(p.flags & MF_SHOOTABLE) || !Collision.checkSight(world, mo, p)) {
        mo.lastlook = (mo.lastlook + 1) & 3;
        continue;
      }
      if (!allaround) {
        const angle = asU32(Collision.angleTo(mo.x, mo.y, p.x, p.y) - mo.angle);
        if (angle > ANG90 && angle < ANG270 && Collision.approxDistance(p.x - mo.x, p.y - mo.y) > MELEERANGE) {
          mo.lastlook = (mo.lastlook + 1) & 3;
          continue;
        }
      }
      mo.target = p;
      return true;
    }
  }

  private static chase(world: World, mo: Mobj, player: Mobj, game: Game): void {
    const info = MOBJINFO[mo.type];
    if (mo.reactiontime) --mo.reactiontime;
    if (mo.movedir < 8) Enemy.faceMoveDir(mo);
    const target = mo.target;
    if (!target || !(target.flags & MF_SHOOTABLE)) {
      if (Enemy.lookForPlayer(world, mo, player, true)) return;
      Thinker.setMobjState(mo, Number(info[MI_SPAWNSTATE]), world, game);
      return;
    }
    if (mo.flags & MF_JUSTATTACKED) {
      mo.flags &= ~MF_JUSTATTACKED;
      if (game.skill !== SK_NIGHTMARE && !game.fastparm) Enemy.newChaseDir(world, mo, game);
      return;
    }
    const dist = Collision.approxDistance(target.x - mo.x, target.y - mo.y);
    const meleeState = Number(info[MI_MELEESTATE]);
    const missileState = Number(info[MI_MISSILESTATE]);
    const speed = Number(info[MI_SPEED]);
    if (
      meleeState &&
      dist < MELEERANGE - 20 * FRACUNIT + target.radius &&
      Collision.checkSight(world, mo, target)
    ) {
      const sound = String(info[MI_ATTACKSOUND] ?? "");
      if (sound) game.startSound(sound);
      Thinker.setMobjState(mo, meleeState, world, game);
      return;
    }
    const skipMissile = game.skill < SK_NIGHTMARE && !game.fastparm && mo.movecount !== 0;
    if (
      missileState &&
      !skipMissile &&
      Enemy.missileOk(world, mo, target, dist, Boolean(meleeState))
    ) {
      Thinker.setMobjState(mo, missileState, world, game);
      mo.flags |= MF_JUSTATTACKED;
      return;
    }
    if (--mo.movecount < 0 || !Enemy.move(world, mo, speed, game)) Enemy.newChaseDir(world, mo, game);
    const active = info[MI_ACTIVESOUND];
    if (active && Enemy.random() < 3) game.startSound(String(active));
  }

  private static missileOk(w: World, mo: Mobj, target: Mobj, dist: number, melee: boolean): boolean {
    if (!Collision.checkSight(w, mo, target)) return false;
    if (mo.flags & MF_JUSTHIT) {
      mo.flags &= ~MF_JUSTHIT;
      return true;
    }
    if (mo.reactiontime) return false;
    let d = dist - 64 * FRACUNIT;
    if (!melee) d -= 128 * FRACUNIT;
    d >>= 16;
    if (mo.type === MT_VILE && d > 14 * 64) return false;
    if (mo.type === MT_UNDEAD) {
      if (d < 196) return false;
      d >>= 1;
    }
    if (mo.type === MT_CYBORG || mo.type === MT_SPIDER || mo.type === MT_SKULL) d >>= 1;
    if (d > 200) d = 200;
    if (mo.type === MT_CYBORG && d > 160) d = 160;
    return Enemy.random() >= d;
  }

  private static startAttack(mo: Mobj, kind: string): void {
    mo.aiState = "attack";
    mo.tics = 26;
    mo.frame = 4;
    mo.attackKind = kind;
    mo.didFire = false;
  }

  private static tickAttack(world: World, mo: Mobj, game: Game): void {
    const t = mo.target;
    if (!t || t.health <= 0) {
      mo.aiState = "look";
      mo.frame = 0;
      mo.tics = 10;
      return;
    }
    Enemy.faceTarget(mo, t);
    if (!mo.didFire && mo.tics <= 16) {
      Enemy.doAttack(world, mo, game);
      mo.didFire = true;
      mo.frame = 5;
    }
    if (--mo.tics <= 0) {
      const kind = mo.attackKind;
      if (
        (kind === "chaingun" || kind === "spider") &&
        Enemy.refireOk(world, mo, kind === "chaingun" ? 40 : 10)
      ) {
        mo.tics = 8;
        mo.didFire = false;
        return;
      }
      mo.aiState = "chase";
      mo.frame = 0;
      mo.movecount = 15 + (Enemy.random() & 15);
    }
  }

  private static doAttack(world: World, mo: Mobj, game: Game): void {
    const kind = mo.attackKind;
    Enemy.faceTarget(mo, mo.target!);
    const target = mo.target!;
    if (kind === "melee") {
      if (Collision.approxDistance(target.x - mo.x, target.y - mo.y) < MELEERANGE + mo.radius) {
        game.damageMobj(target, mo, ((Enemy.random() % 8) + 1) * 3);
      }
    } else if (kind === "shotgun") {
      game.startSound("shotgn");
      const faced = mo.angle;
      const slope = Collision.aimSlope(world, mo, faced, MISSILERANGE);
      for (let i = 0; i < 3; ++i) {
        mo.angle = asU32(faced + ((Enemy.random() - Enemy.random()) << 20));
        Collision.lineAttack(world, mo, ((Enemy.random() % 5) + 1) * 3, game, MISSILERANGE, mo.angle, slope);
      }
      mo.angle = faced;
    } else if (["imp", "baron", "caco"].includes(kind)) {
      if (Collision.approxDistance(target.x - mo.x, target.y - mo.y) < MELEERANGE + mo.radius) {
        game.startSound("claw");
        game.damageMobj(target, mo, ((Enemy.random() % 8) + 1) * 3);
      } else {
        game.startSound("firsht");
        Enemy.spawnMissile(
          world,
          mo,
          target,
          kind === "baron" ? "BAL2" : "BAL1",
          (kind === "baron" ? 15 : 10) * FRACUNIT,
          kind === "baron" ? 8 : 3,
          "ball",
        );
      }
    } else if (kind === "rocket") {
      game.startSound("rlaunc");
      Enemy.spawnMissile(world, mo, target, "MISL", 20 * FRACUNIT, 20, "rocket");
    } else if (kind === "plasma") {
      game.startSound("plasma");
      Enemy.spawnMissile(world, mo, target, "APLS", 25 * FRACUNIT, 5, "plasma");
    } else if (kind === "skull") {
      Enemy.skullAttack(mo, game);
    } else if (kind === "chaingun") {
      game.startSound("shotgn");
      const faced = mo.angle;
      const slope = Collision.aimSlope(world, mo, faced, MISSILERANGE);
      mo.angle = asU32(faced + ((Enemy.random() - Enemy.random()) << 20));
      Collision.lineAttack(world, mo, ((Enemy.random() % 5) + 1) * 3, game, MISSILERANGE, mo.angle, slope);
      mo.angle = faced;
    } else if (kind === "spider") {
      game.startSound("shotgn");
      const faced = mo.angle;
      const slope = Collision.aimSlope(world, mo, faced, MISSILERANGE);
      for (let i = 0; i < 3; ++i) {
        mo.angle = asU32(faced + ((Enemy.random() - Enemy.random()) << 20));
        Collision.lineAttack(world, mo, ((Enemy.random() % 5) + 1) * 3, game, MISSILERANGE, mo.angle, slope);
      }
      mo.angle = faced;
    } else if (kind === "revenant") {
      if (Collision.approxDistance(target.x - mo.x, target.y - mo.y) < MELEERANGE + mo.radius) {
        game.startSound("skeswg");
        game.damageMobj(target, mo, ((Enemy.random() % 8) + 1) * 6);
      } else {
        game.startSound("skeatk");
        const miss = Enemy.spawnMissile(world, mo, target, "FATB", 10 * FRACUNIT, 10, "tracer");
        miss.tracer = target;
      }
    } else if (kind === "mancubus") {
      game.startSound("firsht");
      const spread = Math.trunc(ANG90 / 8);
      for (const da of [-spread, 0, spread]) {
        Enemy.spawnMissile(world, mo, target, "MANF", 20 * FRACUNIT, 8, "fat", asU32(mo.angle + da));
      }
    } else if (kind === "pain") {
      game.startSound("sklatk");
      Enemy.painShootSkull(world, mo, game, mo.angle);
    } else if (kind === "vile") {
      Enemy.vileAttack(world, mo, game);
    } else {
      game.startSound("pistol");
      const faced = mo.angle;
      const slope = Collision.aimSlope(world, mo, faced, MISSILERANGE);
      mo.angle = asU32(faced + ((Enemy.random() - Enemy.random()) << 20));
      Collision.lineAttack(world, mo, ((Enemy.random() % 5) + 1) * 3, game, MISSILERANGE, mo.angle, slope);
      mo.angle = faced;
    }
  }

  private static refireOk(world: World, mo: Mobj, keep: number): boolean {
    if (Enemy.random() < keep) return true;
    const t = mo.target;
    return !!t && t.health > 0 && Collision.checkSight(world, mo, t);
  }

  private static skullAttack(mo: Mobj, game: Game): void {
    const dest = mo.target;
    if (!dest) return;
    mo.flags |= MF_SKULLFLY;
    game.startSound("sklatk");
    Enemy.faceTarget(mo, dest);
    mo.momx = fixedMul(SKULLSPEED, fineCos(mo.angle));
    mo.momy = fixedMul(SKULLSPEED, fineSin(mo.angle));
    const dist = Collision.approxDistance(dest.x - mo.x, dest.y - mo.y);
    const steps = Math.max(1, SKULLSPEED ? intdiv(dist, SKULLSPEED) : 1);
    mo.momz = Math.trunc((dest.z + (dest.height >> 1) - mo.z) / steps);
  }

  private static tickSkullFly(world: World, mo: Mobj, game: Game): void {
    if (mo.momx === 0 && mo.momy === 0) {
      mo.flags &= ~MF_SKULLFLY;
      mo.momz = 0;
      Thinker.setMobjState(mo, Number(MOBJINFO[mo.type][MI_SPAWNSTATE]), world, game);
      return;
    }
    if (!Collision.tryMove(world, mo, mo.x + mo.momx, mo.y + mo.momy, game)) {
      if (mo.flags & MF_SKULLFLY) mo.momx = mo.momy = 0;
      return;
    }
    mo.z += mo.momz;
    if (mo.z <= mo.floorz || mo.z + mo.height > mo.ceilingz) {
      mo.flags &= ~MF_SKULLFLY;
      mo.momx = mo.momy = mo.momz = 0;
      Thinker.setMobjState(mo, Number(MOBJINFO[mo.type][MI_SPAWNSTATE]), world, game);
    }
  }

  private static faceTarget(mo: Mobj, t: Mobj): void {
    mo.angle = Collision.angleTo(mo.x, mo.y, t.x, t.y);
    if (t.flags & MF_SHADOW) mo.angle = asU32(mo.angle + (Enemy.random() - Enemy.random()) * 2097152);
  }

  private static faceMoveDir(mo: Mobj): void {
    if (mo.movedir < 0 || mo.movedir >= 8) return;
    mo.angle = asU32(mo.angle & 3758096384);
    const delta = asI32(mo.angle - mo.movedir * ANG45);
    if (delta > 0) mo.angle = asU32(mo.angle - ANG45);
    else if (delta < 0) mo.angle = asU32(mo.angle + ANG45);
  }

  private static move(world: World, mo: Mobj, speed: number, game: Game): boolean {
    if (mo.movedir < 0 || mo.movedir >= 8) return false;
    const nx = mo.x + speed * Enemy.XSPEED[mo.movedir]!;
    const ny = mo.y + speed * Enemy.YSPEED[mo.movedir]!;
    if (!Collision.tryMove(world, mo, nx, ny, game)) {
      if (mo.flags & MF_FLOAT && Collision.floatOk) {
        mo.z += mo.z < Collision.tmFloorZ ? 4 * FRACUNIT : -4 * FRACUNIT;
        mo.flags |= MF_INFLOAT;
        return true;
      }
      const hits = Collision.lastSpechit;
      if (hits.length === 0) return false;
      mo.movedir = Enemy.DI_NODIR;
      let good = false;
      for (let i = hits.length - 1; i >= 0; i--) {
        const ln = hits[i]!;
        if (ln.special) {
          game.useSpecial(ln, mo, 0);
          if (ln.special === 0) good = true;
        }
      }
      return good;
    }
    mo.flags &= ~MF_INFLOAT;
    if ((mo.flags & MF_FLOAT) === 0) mo.z = mo.floorz;
    return true;
  }

  private static newChaseDir(world: World, mo: Mobj, game: Game): void {
    const t = mo.target;
    if (!t) return;
    const old = mo.movedir;
    const turn = Enemy.OPPOSITE[old] ?? Enemy.DI_NODIR;
    const dx = t.x - mo.x;
    const dy = t.y - mo.y;
    let d2 =
      dx > 10 * FRACUNIT ? Enemy.DI_EAST : dx < -10 * FRACUNIT ? Enemy.DI_WEST : Enemy.DI_NODIR;
    let d3 =
      dy < -10 * FRACUNIT ? Enemy.DI_SOUTH : dy > 10 * FRACUNIT ? Enemy.DI_NORTH : Enemy.DI_NODIR;
    const speed = Number(MOBJINFO[mo.type][MI_SPEED]);
    if (d2 !== Enemy.DI_NODIR && d3 !== Enemy.DI_NODIR) {
      mo.movedir = Enemy.DIAGS[(dy < 0 ? 2 : 0) + (dx > 0 ? 1 : 0)]!;
      if (mo.movedir !== turn && Enemy.move(world, mo, speed, game)) {
        mo.movecount = Enemy.random() & 15;
        return;
      }
    }
    if (Enemy.random() > 200 || Math.abs(dy) > Math.abs(dx)) {
      const tmp = d2;
      d2 = d3;
      d3 = tmp;
    }
    if (d2 === turn) d2 = Enemy.DI_NODIR;
    if (d3 === turn) d3 = Enemy.DI_NODIR;
    for (const d of [d2, d3, old]) {
      if (d !== Enemy.DI_NODIR) {
        mo.movedir = d;
        if (Enemy.move(world, mo, speed, game)) {
          mo.movecount = Enemy.random() & 15;
          return;
        }
      }
    }
    const dirs = Enemy.random() & 1 ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
    for (const d of dirs) {
      if (d !== turn) {
        mo.movedir = d;
        if (Enemy.move(world, mo, speed, game)) {
          mo.movecount = Enemy.random() & 15;
          return;
        }
      }
    }
    if (turn !== Enemy.DI_NODIR) {
      mo.movedir = turn;
      if (Enemy.move(world, mo, speed, game)) {
        mo.movecount = Enemy.random() & 15;
        return;
      }
    }
    mo.movedir = Enemy.DI_NODIR;
    mo.movecount = Enemy.random() & 15;
  }

  private static spawnMissile(
    world: World,
    src: Mobj,
    dest: Mobj,
    sprite: string,
    _speed: number,
    _damage: number,
    kind = "ball",
    ang?: number,
  ): Mobj {
    let a = ang ?? Collision.angleTo(src.x, src.y, dest.x, dest.y);
    if (ang === undefined && dest.flags & MF_SHADOW) a = asU32(a + (Enemy.random() - Enemy.random()) * 1048576);
    const typ =
      kind === "rocket"
        ? MT_ROCKET
        : kind === "plasma"
          ? sprite === "APLS"
            ? MT_ARACHPLAZ
            : MT_PLASMA
          : kind === "bfg"
            ? MT_BFG
            : kind === "tracer"
              ? MT_TRACER
              : kind === "fat"
                ? MT_FATSHOT
                : kind === "spawncube"
                  ? MT_SPAWNSHOT
                  : sprite === "BAL2"
                    ? MT_BRUISERSHOT
                    : sprite === "BAL1" && src.type === MT_HEAD
                      ? MT_HEADSHOT
                      : MT_TROOPSHOT;
    const speed = Number(MOBJINFO[typ][MI_SPEED]);
    const dist = Collision.approxDistance(dest.x - src.x, dest.y - src.y);
    const steps = Math.max(1, speed ? intdiv(dist, speed) : 1);
    const mo = Thinker.spawnMobj(world, src.x, src.y, src.z + 32 * FRACUNIT, typ, null);
    mo.target = src;
    mo.angle = a;
    mo.momx = fixedMul(speed, fineCos(a));
    mo.momy = fixedMul(speed, fineSin(a));
    mo.momz = Math.trunc((dest.z - src.z) / steps);
    mo.missileKind = kind;
    if (kind === "tracer") mo.tracer = dest;
    Enemy.checkMissileSpawn(mo);
    return mo;
  }

  private static checkMissileSpawn(mo: Mobj): void {
    mo.tics -= Enemy.random() & 3;
    if (mo.tics < 1) mo.tics = 1;
    mo.x += mo.momx >> 1;
    mo.y += mo.momy >> 1;
    mo.z += mo.momz >> 1;
  }

  static spawnPlayerMissile(
    world: World,
    src: Mobj,
    sprite: string,
    speed: number,
    damage: number,
    kind: string,
  ): void {
    const a = src.angle;
    const typ = kind === "rocket" ? MT_ROCKET : kind === "plasma" ? MT_PLASMA : MT_BFG;
    const actualSpeed = Number(MOBJINFO[typ][MI_SPEED]) || speed;
    const mo = Thinker.spawnMobj(world, src.x, src.y, src.z + 32 * FRACUNIT, typ, null);
    mo.target = src;
    mo.angle = a;
    mo.momx = fixedMul(actualSpeed, fineCos(a));
    mo.momy = fixedMul(actualSpeed, fineSin(a));
    mo.momz = 0;
    mo.missileKind = kind;
    Enemy.checkMissileSpawn(mo);
  }

  private static tickMissile(world: World, mo: Mobj, game: Game): void {
    const kind = mo.missileKind || (Array.isArray(mo.info) ? String(mo.info[1] ?? "") : "");
    if (kind === "tracer" && (game.leveltime & 3) === 0) Enemy.tracerHome(mo);
    if (kind === "spawncube") {
      const dest = mo.tracer;
      mo.x += mo.momx;
      mo.y += mo.momy;
      mo.z += mo.momz;
      if (!dest || Collision.approxDistance(dest.x - mo.x, dest.y - mo.y) < 24 * FRACUNIT) {
        Enemy.spawnFly(world, mo, game);
      }
      return;
    }
    const nx = mo.x + mo.momx;
    const ny = mo.y + mo.momy;
    const chk = Collision.checkPosition(world, mo, nx, ny);
    if (chk.blocked || !Collision.tryMove(world, mo, nx, ny, game)) {
      Enemy.explodeMissile(world, mo, game, chk.hitThing === mo ? null : chk.hitThing);
      return;
    }
    mo.z += mo.momz;
    if (mo.z <= mo.floorz || mo.z + mo.height > mo.ceilingz) {
      Enemy.explodeMissile(world, mo, game, null);
      return;
    }
    mo.frame = (mo.frame + 1) & 1;
  }

  private static explodeMissile(world: World, mo: Mobj, game: Game, hit: Mobj | null): void {
    if (hit) {
      const damage = mo.damage || Number(MOBJINFO[mo.type][MI_DAMAGE]);
      game.damageMobj(hit, mo.target ?? mo, damage * ((Enemy.random() % 8) + 1), mo);
    }
    mo.momx = mo.momy = mo.momz = 0;
    mo.flags &= ~MF_MISSILE;
    Thinker.setMobjState(mo, Number(MOBJINFO[mo.type][MI_DEATHSTATE]), world, game);
  }

  private static radiusAttack(world: World, spot: Mobj, source: Mobj | null, damage: number, game: Game): void {
    for (const o of [...world.mobjs]) {
      if (o === spot || !(o.flags & MF_SHOOTABLE) || o.type === MT_CYBORG || o.type === MT_SPIDER) continue;
      const dx = Math.abs(o.x - spot.x);
      const dy = Math.abs(o.y - spot.y);
      let dist = (dx > dy ? dx : dy) - o.radius;
      if (dist < 0) dist = 0;
      dist >>= 16;
      if (dist >= damage) continue;
      if (Collision.checkSight(world, o, spot)) {
        game.damageMobj(o, source ?? spot, damage - dist, spot);
      }
    }
  }

  private static bfgSpray(world: World, ball: Mobj, game: Game): void {
    const shooter = ball.target;
    if (!shooter) return;
    for (let i = 0; i < 40; i++) {
      const an = asU32(shooter.angle - Math.trunc(ANG90 / 2) + Math.trunc(ANG90 / 40) * i);
      const target = Collision.aimLineAttack(world, shooter, an, 16 * 64 * FRACUNIT);
      if (!target) continue;
      let damage = 0;
      for (let j = 0; j < 15; j++) damage += (Enemy.random() & 7) + 1;
      game.damageMobj(target, shooter, damage, ball);
    }
  }

  private static explodeBarrel(world: World, barrel: Mobj, game: Game): void {
    Enemy.radiusAttack(world, barrel, barrel, 128, game);
  }

  private static spriteAndFrame(name: string): [string, number] {
    const n = name.toUpperCase();
    const spr = n.slice(0, 4);
    const frame = n.length >= 5 && n[4]! >= "A" && n[4]! <= "]" ? n.charCodeAt(4) - 65 : 0;
    return [spr, frame];
  }

  private static tracerHome(mo: Mobj): void {
    const dest = mo.tracer;
    if (!dest || dest.health <= 0) return;
    const exact = Collision.angleTo(mo.x, mo.y, dest.x, dest.y);
    const diff = (exact - mo.angle) >>> 0;
    if (diff > 0x80000000) {
      mo.angle = asU32(mo.angle - Enemy.TRACEANGLE);
      if (((exact - mo.angle) >>> 0) < 0x80000000) mo.angle = exact;
    } else {
      mo.angle = asU32(mo.angle + Enemy.TRACEANGLE);
      if (((exact - mo.angle) >>> 0) > 0x80000000) mo.angle = exact;
    }
    const speed = Number(MOBJINFO[mo.type][MI_SPEED]);
    mo.momx = fixedMul(speed, fineCos(mo.angle));
    mo.momy = fixedMul(speed, fineSin(mo.angle));
    const dist = Collision.approxDistance(dest.x - mo.x, dest.y - mo.y);
    const steps = Math.max(1, speed ? intdiv(dist, speed) : 1);
    mo.momz = Math.trunc((dest.z + 40 * FRACUNIT - mo.z) / steps);
  }

  private static vileChase(world: World, mo: Mobj, game: Game): boolean {
    for (const other of world.mobjs) {
      if (other === mo || !(other.flags & MF_CORPSE)) continue;
      if (other.health > 0) continue;
      const info = MOBJINFO[other.type];
      const raiseState = Number(info[MI_RAISESTATE]);
      if (!raiseState) continue;
      const maxdist = mo.radius + other.radius;
      if (Math.abs(other.x - mo.x) > maxdist || Math.abs(other.y - mo.y) > maxdist) continue;
      Thinker.setMobjState(mo, S_VILE_HEAL1, world, game);
      game.startSound("slop");
      Thinker.setMobjState(other, raiseState, world, game);
      other.flags = Number(info[MI_FLAGS]);
      other.health = Number(info[MI_SPAWNHEALTH]);
      other.height = Number(info[MI_HEIGHT]);
      other.radius = Number(info[MI_RADIUS]);
      other.target = null;
      other.alive = true;
      other.z = other.floorz;
      return true;
    }
    return false;
  }

  private static vileAttack(world: World, mo: Mobj, game: Game): void {
    const dest = mo.target;
    if (!dest || !Collision.checkSight(world, mo, dest)) return;
    game.startSound("vilatk");
    game.damageMobj(dest, mo, 20);
    Enemy.radiusAttack(world, dest, mo, 70, game);
  }

  private static painShootSkull(world: World, actor: Mobj, game: Game, ang: number): void {
    let n = 0;
    for (const other of world.mobjs) if (other.type === MT_SKULL && other.health > 0) n++;
    if (n >= 21) return;
    const pre = 4 * FRACUNIT + intdiv(3 * actor.radius, 2);
    const x = actor.x + fixedMul(pre, fineCos(ang));
    const y = actor.y + fixedMul(pre, fineSin(ang));
    const skull = Thinker.spawnMobj(world, x, y, actor.z, MT_SKULL, game);
    skull.angle = ang;
    const chk = Collision.checkPosition(world, skull, skull.x, skull.y);
    if (chk.blocked) {
      game.damageMobj(skull, actor, 10000, actor);
      return;
    }
    skull.target = actor.target;
    Enemy.skullAttack(skull, game);
  }

  private static painDie(world: World, mo: Mobj, game: Game): void {
    for (const da of [ANG90, ANG90 * 2, ANG270]) Enemy.painShootSkull(world, mo, game, asU32(mo.angle + da));
  }

  private static aliveOfType(world: World, typ: number): boolean {
    for (const other of world.mobjs) if (other.type === typ && other.health > 0) return true;
    return false;
  }

  private static commercial(game: Game): boolean {
    return game.wad.checkNumForName("MAP01") >= 0;
  }

  private static bossDeath(world: World, mo: Mobj, game: Game): void {
    if (Enemy.aliveOfType(world, mo.type)) return;
    const spec = game.specials;
    if (!spec) return;
    if (Enemy.commercial(game) && game.mapn === 7) {
      if (mo.type === MT_FATSO) spec.doFloorTag(666, Specials.lowestFloor, -1);
      else if (mo.type === MT_BABY) spec.raiseToTextureTag(667);
      return;
    }
    if (Enemy.commercial(game)) return;
    if (game.episode === 1 && game.mapn === 8 && mo.type === MT_BRUISER) spec.doFloorTag(666, Specials.lowestFloor, -1);
    else if (game.episode === 2 && game.mapn === 8 && mo.type === MT_CYBORG) spec.exitRequested = true;
    else if (game.episode === 3 && game.mapn === 8 && mo.type === MT_SPIDER) spec.exitRequested = true;
    else if (game.episode === 4 && game.mapn === 6 && mo.type === MT_CYBORG) spec.doFloorTag(666, Specials.lowestFloor, -1);
    else if (game.episode === 4 && game.mapn === 8 && mo.type === MT_BRUISER) spec.doFloorTag(666, Specials.lowestFloor, -1);
  }

  private static keenDie(world: World, _mo: Mobj, game: Game): void {
    if (Enemy.aliveOfType(world, MT_KEEN)) return;
    game.specials?.doDoorTag(666, VLD_BLAZEOPEN);
  }

  private static brainDie(game: Game): void {
    if (game.specials) game.specials.exitRequested = true;
  }

  private static tickBrainEye(world: World, mo: Mobj, game: Game): void {
    if (mo.tics > 0) {
      --mo.tics;
      return;
    }
    mo.tics = 150;
    Enemy.brainSpit(world, mo, game);
  }

  private static brainSpit(world: World, actor: Mobj, game: Game): void {
    if (game.skill <= SK_EASY) {
      actor.easySkip = !actor.easySkip;
      if (actor.easySkip) return;
    }
    const targs = world.mobjs.filter((m) => m.type === MT_BOSSTARGET);
    if (!targs.length) return;
    const dest = targs[Enemy.brainTargetOn % targs.length]!;
    Enemy.brainTargetOn++;
    game.startSound("bospit");
    const miss = Enemy.spawnMissile(world, actor, dest, "BOSF", 10 * FRACUNIT, 0, "spawncube");
    miss.target = dest;
    const stateTics = miss.tics || 1;
    if (miss.momy) miss.reactiontime = intdiv(intdiv(dest.y - actor.y, miss.momy), stateTics);
  }

  private static spawnFly(world: World, cube: Mobj, game: Game): void {
    const dest = cube.target ?? cube;
    const r = Enemy.random();
    let typ: number;
    if (r < 50) typ = MT_TROOP;
    else if (r < 90) typ = MT_SERGEANT;
    else if (r < 120) typ = MT_SHADOWS;
    else if (r < 130) typ = MT_PAIN;
    else if (r < 160) typ = MT_HEAD;
    else if (r < 162) typ = MT_VILE;
    else if (r < 172) typ = MT_UNDEAD;
    else if (r < 192) typ = MT_BABY;
    else if (r < 222) typ = MT_FATSO;
    else if (r < 246) typ = MT_KNIGHT;
    else typ = MT_BRUISER;
    game.startSound("telept");
    const spawned = Thinker.spawnMobj(world, dest.x, dest.y, dest.z, typ, game);
    spawned.angle = dest.angle;
    Thinker.removeMobj(world, cube);
  }

  public static publicRandom(): number {
    return Enemy.random();
  }

  private static trunc2(n: number): number {
    n = asI32(n);
    if (n < 0) return -Math.trunc(-n / 2);
    return Math.trunc(n / 2);
  }

  /** P_XYMovement: half-steps above MAXMOVE/2, then friction on the floor. */
  public static pXyMovement(world: World, mo: Mobj, game: Game): void {
    if (mo.momx === 0 && mo.momy === 0) {
      if (mo.flags & MF_SKULLFLY) {
        mo.flags &= ~MF_SKULLFLY;
        mo.momx = mo.momy = mo.momz = 0;
        Thinker.setMobjState(mo, Number(MOBJINFO[mo.type]![MI_SPAWNSTATE]), world, game);
      }
      return;
    }
    if (mo.momx > MAXMOVE) mo.momx = MAXMOVE;
    else if (mo.momx < -MAXMOVE) mo.momx = -MAXMOVE;
    if (mo.momy > MAXMOVE) mo.momy = MAXMOVE;
    else if (mo.momy < -MAXMOVE) mo.momy = -MAXMOVE;
    let xmove = mo.momx;
    let ymove = mo.momy;
    const half = Math.trunc(MAXMOVE / 2);
    while (xmove !== 0 || ymove !== 0) {
      let ptryx: number;
      let ptryy: number;
      if (xmove > half || ymove > half) {
        ptryx = mo.x + Enemy.trunc2(xmove);
        ptryy = mo.y + Enemy.trunc2(ymove);
        xmove = Enemy.trunc2(xmove);
        ymove = Enemy.trunc2(ymove);
      } else {
        ptryx = mo.x + xmove;
        ptryy = mo.y + ymove;
        xmove = ymove = 0;
      }
      if (mo.flags & MF_NOCLIP) {
        Collision.unsetThingPosition(world, mo);
        mo.x = ptryx;
        mo.y = ptryy;
        Collision.setThingPosition(world, mo);
        continue;
      }
      if (Collision.tryMove(world, mo, ptryx, ptryy, game)) continue;
      if (mo.player !== null) {
        Collision.slideMove(world, mo, mo.momx, mo.momy, game);
      } else if (mo.flags & MF_MISSILE) {
        const line = Collision.ceilingLine;
        const sky = game.res?.skyflatnum ?? -1;
        if (line !== null && line.backsector !== null && line.backsector.ceilingpic === sky) {
          Thinker.removeMobj(world, mo);
          return;
        }
        Enemy.explodeMissile(world, mo, game, null);
        return;
      } else {
        mo.momx = mo.momy = 0;
      }
    }
    const player = mo.player;
    if (player !== null && (player.cheats & CF_NOMOMENTUM) !== 0) {
      mo.momx = mo.momy = 0;
      return;
    }
    if (mo.flags & (MF_MISSILE | MF_SKULLFLY)) return;
    if (mo.z > mo.floorz) return;
    if (mo.flags & MF_CORPSE) {
      const quarter = intdiv(FRACUNIT, 4);
      if (mo.momx > quarter || mo.momx < -quarter || mo.momy > quarter || mo.momy < -quarter) {
        const sec = Collision.pointInSubsector(world, mo.x, mo.y).sector!;
        if (mo.floorz !== sec.floorheight) return;
      }
    }
    if (
      -STOPSPEED < mo.momx &&
      mo.momx < STOPSPEED &&
      -STOPSPEED < mo.momy &&
      mo.momy < STOPSPEED &&
      (player === null || (player.cmd.forwardmove === 0 && player.cmd.sidemove === 0))
    ) {
      if (player !== null) {
        const n = mo.istate - S_PLAY_RUN1;
        if (n >= 0 && n < 4) Thinker.setMobjState(mo, S_PLAY, world, game);
      }
      mo.momx = mo.momy = 0;
    } else {
      mo.momx = fixedMul(mo.momx, FRICTION);
      mo.momy = fixedMul(mo.momy, FRICTION);
    }
  }

  public static missileXy(world: World, mo: Mobj, game: Game): void {
    Enemy.pXyMovement(world, mo, game);
  }

  public static skullXy(world: World, mo: Mobj, game: Game): void {
    Enemy.pXyMovement(world, mo, game);
  }

  public static groundXy(world: World, mo: Mobj, game: Game): void {
    Enemy.pXyMovement(world, mo, game);
  }

  /** P_ZMovement. Gravity applies only while airborne, and the first tic is doubled. */
  public static mobjZ(mo: Mobj, world: World, game: Game): void {
    const player = mo.player;
    if (player !== null && mo.z < mo.floorz) {
      player.viewheight -= mo.floorz - mo.z;
      player.deltaviewheight = shar(VIEWHEIGHT - player.viewheight, 3);
    }
    mo.z += mo.momz;
    if ((mo.flags & MF_FLOAT) !== 0 && mo.target !== null && (mo.flags & (MF_SKULLFLY | MF_INFLOAT)) === 0) {
      const dist = Collision.approxDistance(mo.x - mo.target.x, mo.y - mo.target.y);
      const delta = mo.target.z + shar(mo.height, 1) - mo.z;
      if (delta < 0 && dist < -(delta * 3)) mo.z -= Enemy.FLOATSPEED;
      else if (delta > 0 && dist < delta * 3) mo.z += Enemy.FLOATSPEED;
    }
    if (mo.z <= mo.floorz) {
      if (mo.momz < 0) {
        if (player !== null && mo.momz < -GRAVITY * 8) {
          player.deltaviewheight = shar(mo.momz, 3);
          game.startSound("oof");
        }
        mo.momz = 0;
      }
      mo.z = mo.floorz;
      if ((mo.flags & MF_SKULLFLY) !== 0 && (mo.flags & MF_MISSILE) === 0) mo.momz = asI32(-mo.momz);
      if ((mo.flags & MF_MISSILE) !== 0 && (mo.flags & MF_NOCLIP) === 0) {
        Enemy.explodeMissile(world, mo, game, null);
        return;
      }
    } else if ((mo.flags & MF_NOGRAVITY) === 0) {
      if (mo.momz === 0) mo.momz = -GRAVITY * 2;
      else mo.momz -= GRAVITY;
    }
    if (mo.z + mo.height > mo.ceilingz) {
      if (mo.momz > 0) mo.momz = 0;
      mo.z = mo.ceilingz - mo.height;
      if (mo.flags & MF_SKULLFLY) mo.momz = asI32(-mo.momz);
      if ((mo.flags & MF_MISSILE) !== 0 && (mo.flags & MF_NOCLIP) === 0) {
        Enemy.explodeMissile(world, mo, game, null);
      }
    }
  }

  public static callAction(name: string, mo: Mobj, world: World, game: Game | null): void {
    const player = game?.player?.mo ?? null;
    if (name === "Look") {
      if (player && game) Enemy.look(world, mo, player, game);
    } else if (name === "Chase") {
      if (player && game) Enemy.chase(world, mo, player, game);
    } else if (name === "VileChase") {
      if (game && !Enemy.vileChase(world, mo, game) && player) Enemy.chase(world, mo, player, game);
    } else if (name === "FaceTarget") {
      if (mo.target) Enemy.faceTarget(mo, mo.target);
    } else if (name === "Fall") {
      mo.flags &= ~MF_SOLID;
    } else if (name === "Scream") {
      if (!game) return;
      let sound = String(MOBJINFO[mo.type][MI_DEATHSOUND] ?? "");
      if (sound === "podth1") sound = ["podth1", "podth2", "podth3"][Enemy.random() % 3]!;
      else if (sound === "bgdth1") sound = ["bgdth1", "bgdth2"][Enemy.random() % 2]!;
      if (sound) game.startSound(sound);
    } else if (name === "XScream") {
      game?.startSound("slop");
    } else if (name === "Pain") {
      const sound = String(MOBJINFO[mo.type][MI_PAINSOUND] ?? "");
      if (sound) game?.startSound(sound);
    } else if (name === "Explode") {
      if (game) Enemy.radiusAttack(world, mo, mo.target, 128, game);
    } else if (
      [
        "PosAttack",
        "SPosAttack",
        "CPosAttack",
        "TroopAttack",
        "SargAttack",
        "HeadAttack",
        "BruisAttack",
        "SkullAttack",
        "CyberAttack",
        "BspiAttack",
        "PainAttack",
      ].includes(name)
    ) {
      if (!game) return;
      const attacks: Record<string, string> = {
        PosAttack: "hitscan",
        SPosAttack: "shotgun",
        CPosAttack: "chaingun",
        TroopAttack: "imp",
        SargAttack: "melee",
        HeadAttack: "caco",
        BruisAttack: "baron",
        SkullAttack: "skull",
        CyberAttack: "rocket",
        BspiAttack: "plasma",
        PainAttack: "pain",
      };
      mo.attackKind = attacks[name]!;
      Enemy.doAttack(world, mo, game);
    } else if (name === "CPosRefire" || name === "SpidRefire") {
      if (!game) return;
      if (mo.target) Enemy.faceTarget(mo, mo.target);
      const keep = name === "CPosRefire" ? 40 : 10;
      if (
        Enemy.random() >= keep &&
        (!mo.target || mo.target.health <= 0 || !Collision.checkSight(world, mo, mo.target))
      ) {
        Thinker.setMobjState(mo, Number(MOBJINFO[mo.type][MI_SEESTATE]), world, game);
      }
    } else if (name === "Metal" || name === "BabyMetal" || name === "Hoof") {
      if (!game) return;
      game.startSound(name === "Metal" ? "metal" : name === "Hoof" ? "hoof" : "bspwlk");
      if (player) Enemy.chase(world, mo, player, game);
    } else if (name === "PainDie") {
      mo.flags &= ~MF_SOLID;
      if (game) Enemy.painDie(world, mo, game);
    } else if (name === "KeenDie") {
      mo.flags &= ~MF_SOLID;
      if (game) Enemy.keenDie(world, mo, game);
    } else if (name === "BossDeath") {
      if (game) Enemy.bossDeath(world, mo, game);
    } else if (name === "VileStart") {
      game?.startSound("vilatk");
    } else if (name === "VileTarget") {
      if (!game || !mo.target) return;
      Enemy.faceTarget(mo, mo.target);
      const fire = Thinker.spawnMobj(world, mo.target.x, mo.target.y, mo.target.z, MT_FIRE, game);
      mo.tracer = fire;
      fire.target = mo;
      fire.tracer = mo.target;
    } else if (name === "VileAttack") {
      if (game) Enemy.vileAttack(world, mo, game);
    } else if (name === "StartFire" || name === "Fire" || name === "FireCrackle") {
      if (name === "StartFire") game?.startSound("flamst");
      else if (name === "FireCrackle") game?.startSound("flame");
      if (mo.tracer && mo.target) {
        mo.x = mo.tracer.x;
        mo.y = mo.tracer.y;
        mo.z = mo.tracer.z;
      }
    } else if (name === "SkelWhoosh") {
      if (mo.target) Enemy.faceTarget(mo, mo.target);
      game?.startSound("skeswg");
    } else if (name === "SkelFist") {
      if (!game || !mo.target) return;
      Enemy.faceTarget(mo, mo.target);
      if (Collision.approxDistance(mo.target.x - mo.x, mo.target.y - mo.y) < MELEERANGE + mo.radius) {
        game.startSound("skepch");
        game.damageMobj(mo.target, mo, ((Enemy.random() % 8) + 1) * 6);
      }
    } else if (name === "SkelMissile") {
      if (!game || !mo.target) return;
      Enemy.faceTarget(mo, mo.target);
      const missile = Enemy.spawnMissile(world, mo, mo.target, "FATB", 0, 0, "tracer");
      missile.tracer = mo.target;
      missile.z += 16 * FRACUNIT;
    } else if (name === "Tracer") {
      if (game && (game.leveltime & 3) === 0) Enemy.tracerHome(mo);
    } else if (name === "FatRaise") {
      if (mo.target) Enemy.faceTarget(mo, mo.target);
      game?.startSound("manatk");
    } else if (name === "FatAttack1" || name === "FatAttack2" || name === "FatAttack3") {
      if (!game || !mo.target) return;
      Enemy.faceTarget(mo, mo.target);
      const adjust = (missile: Mobj, angle: number): void => {
        missile.angle = asU32(angle);
        const speed = Number(MOBJINFO[missile.type][MI_SPEED]);
        missile.momx = fixedMul(speed, fineCos(missile.angle));
        missile.momy = fixedMul(speed, fineSin(missile.angle));
      };
      if (name === "FatAttack1") {
        mo.angle = asU32(mo.angle + Enemy.FATSPREAD);
        Enemy.spawnMissile(world, mo, mo.target, "MANF", 0, 0, "fat");
        const missile = Enemy.spawnMissile(world, mo, mo.target, "MANF", 0, 0, "fat");
        adjust(missile, missile.angle + Enemy.FATSPREAD);
      } else if (name === "FatAttack2") {
        mo.angle = asU32(mo.angle - Enemy.FATSPREAD);
        Enemy.spawnMissile(world, mo, mo.target, "MANF", 0, 0, "fat");
        const missile = Enemy.spawnMissile(world, mo, mo.target, "MANF", 0, 0, "fat");
        adjust(missile, missile.angle - Enemy.FATSPREAD * 2);
      } else {
        let missile = Enemy.spawnMissile(world, mo, mo.target, "MANF", 0, 0, "fat");
        adjust(missile, mo.angle - Math.trunc(Enemy.FATSPREAD / 2));
        missile = Enemy.spawnMissile(world, mo, mo.target, "MANF", 0, 0, "fat");
        adjust(missile, mo.angle + Math.trunc(Enemy.FATSPREAD / 2));
      }
    } else if (name === "BrainAwake") {
      Enemy.brainTargetOn = 0;
      game?.startSound("bossit");
    } else if (name === "BrainSpit") {
      if (game) Enemy.brainSpit(world, mo, game);
    } else if (name === "SpawnSound") {
      game?.startSound("boscub");
      if (game) Enemy.aSpawnFly(world, mo, game);
    } else if (name === "SpawnFly") {
      if (game) Enemy.aSpawnFly(world, mo, game);
    } else if (name === "BrainDie") {
      if (game) Enemy.brainDie(game);
    } else if (name === "BrainPain") {
      game?.startSound("bospn");
    } else if (name === "BrainScream") {
      game?.startSound("bosdth");
    } else if (name === "BFGSpray") {
      if (game) Enemy.bfgSpray(world, mo, game);
    } else if (name === "PlayerScream") {
      game?.startSound("pldeth");
    }
  }

  private static aSpawnFly(world: World, mo: Mobj, game: Game): void {
    --mo.reactiontime;
    if (mo.reactiontime === 0) Enemy.spawnFly(world, mo, game);
  }

  private static spawnType(world: World, typ: number, x: number, y: number, z: number, angle: number): Mobj | null {
    const info = Mobj.infoTable()[typ];
    if (!info) return null;
    let [sprite, rad, h, health, flags, kind, extra] = info;
    if (kind === "enemy" && typ !== MT_BARREL) flags |= MF_COUNTKILL;
    const [spr4, sprframe] = Enemy.spriteAndFrame(sprite);
    const sub = Collision.pointInSubsector(world, x, y);
    const mo = new Mobj({
      x,
      y,
      z: z || sub.sector!.floorheight,
      angle: asU32(angle),
      radius: rad * FRACUNIT,
      height: h * FRACUNIT,
      floorz: sub.sector!.floorheight,
      ceilingz: sub.sector!.ceilingheight,
      flags,
      health: health || 1000,
      type: typ,
      sprite: spr4,
      info: [kind, extra],
      aiState: kind === "enemy" ? "look" : "",
      frame: sprframe,
      tics: kind === "enemy" ? 10 : 0,
      reactiontime: kind === "enemy" ? 8 : 0,
    });
    if (typ === MT_KEEN) mo.z = mo.ceilingz - mo.height;
    world.mobjs.push(mo);
    return mo;
  }
}

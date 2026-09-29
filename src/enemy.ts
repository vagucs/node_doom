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
  ANG45,
  ANG90,
  ANG270,
  FRACUNIT,
  MELEERANGE,
  MF_AMBUSH,
  MF_CORPSE,
  MF_DROPOFF,
  MF_MISSILE,
  MF_NOGRAVITY,
  MF_SHOOTABLE,
  MF_SOLID,
  MISSILERANGE,
  ML_SOUNDBLOCK,
  ML_TWOSIDED,
} from "./defs.ts";
import type { Game } from "./game.ts";
import { Mobj } from "./mobj.ts";
import { fineCos, fineSin } from "./tables.ts";
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
  private static seed = 1;

  private static profiles(): Record<number, Profile> {
    return {
      3004: [8, "hitscan", "posit1", "podth1", "pistol", 7, 5, 4],
      9: [8, "shotgun", "posit2", "podth2", "shotgn", 7, 5, 3],
      3001: [8, "imp", "bgsit1", "bgdth1", "claw", 7, 6, 3],
      3002: [10, "melee", "sgtsit", "sgtdth", "sgtatk", 7, 6, 2],
      58: [10, "melee", "sgtsit", "sgtdth", "sgtatk", 7, 6, 2],
      3003: [8, "baron", "brssit", "brsdth", "claw", 7, 7, 3],
      3005: [8, "caco", "cacsit", "cacdth", "claw", 5, 6, 3],
      3006: [8, "melee", "sklatk", "firxpl", "sklatk", 5, 6, 3],
      16: [16, "hitscan", "cybsit", "cybdth", "pistol", 5, 9, 3],
      7: [12, "shotgun", "spisit", "spidth", "shotgn", 5, 10, 3],
      68: [12, "hitscan", "bspsit", "bspdth", "plasma", 5, 7, 3],
      69: [8, "baron", "kntsit", "kntdth", "claw", 7, 7, 3],
      84: [8, "hitscan", "posit1", "podth1", "pistol", 7, 5, 3],
      2035: [0, "none", null, "barexp", null, 0, 5, 4],
    };
  }

  private static random(): number {
    Enemy.seed = Number((BigInt(Enemy.seed) * 1103515245n + 12345n) & 0x7fffffffn);
    return (Enemy.seed >> 16) & 255;
  }

  private static walkTics(mo: Mobj): number {
    return Enemy.profiles()[mo.type]?.[7] ?? 3;
  }

  static tickEnemies(world: World, game: Game): void {
    const p = game.player;
    if (!p || !p.mo) return;
    for (const mo of [...world.mobjs]) {
      if (mo === p.mo) continue;
      if (mo.flags & MF_MISSILE) {
        Enemy.tickMissile(world, mo, game);
        continue;
      }
      if (!mo.info || mo.info[0] !== "enemy") continue;
      if (mo.health <= 0) {
        Enemy.tickDead(world, mo);
        continue;
      }
      const prof = Enemy.profiles()[mo.type] ?? null;
      if (prof && prof[1] === "none") continue;
      if (mo.aiState === "attack") {
        Enemy.tickAttack(world, mo, game);
      } else if (mo.aiState === "chase") {
        if (mo.chaseTics > 0) --mo.chaseTics;
        else {
          Enemy.chase(world, mo, p.mo, game);
          if (mo.aiState === "chase") mo.chaseTics = Math.max(0, Enemy.walkTics(mo) - 1);
        }
      } else {
        Enemy.tickStand(mo);
        Enemy.look(world, mo, p.mo, game);
      }
    }
  }

  private static tickStand(mo: Mobj): void {
    if (mo.tics > 0) {
      --mo.tics;
      return;
    }
    mo.frame = (mo.frame + 1) % (mo.type === 3005 ? 1 : 2);
    mo.tics = 10;
  }

  static killMonster(mo: Mobj, game: Game, source: Mobj | null): void {
    mo.health = 0;
    mo.flags &= ~(MF_SOLID | MF_SHOOTABLE);
    mo.flags |= MF_CORPSE;
    mo.target = null;
    mo.aiState = "die";
    const prof = Enemy.profiles()[mo.type] ?? null;
    if (prof) {
      const atk = prof[1];
      const sfx = prof[3];
      const d0 = prof[5];
      mo.frame = d0;
      mo.tics = 5;
      if (atk === "none") {
        mo.sprite = "BEXP";
        mo.frame = 0;
      }
      if (sfx) game.startSound(sfx);
      if (mo.type === 2035) Enemy.explodeBarrel(game.world!, mo, game);
    } else {
      mo.frame = 7;
      mo.tics = 5;
      game.startSound("podth1");
    }
    if (source?.player) ++source.player.killcount;
  }

  private static tickDead(world: World, mo: Mobj): void {
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
    if (!(player.flags & MF_SHOOTABLE)) return;
    let see = false;
    const sec = Collision.pointInSubsector(world, mo.x, mo.y).sector!;
    const target = sec.soundtarget;
    if (target && target.flags & MF_SHOOTABLE) {
      mo.target = target;
      see = mo.flags & MF_AMBUSH ? Collision.checkSight(world, mo, target) : true;
    }
    if (!see && !Enemy.lookForPlayer(world, mo, player)) return;
    if (!mo.target) mo.target = player;
    mo.aiState = "chase";
    mo.movedir = Enemy.DI_NODIR;
    mo.movecount = 0;
    const prof = Enemy.profiles()[mo.type] ?? null;
    if (prof && prof[2]) game.startSound(prof[2]);
    mo.frame = 0;
  }

  private static lookForPlayer(world: World, mo: Mobj, p: Mobj): boolean {
    if (p.health <= 0 || !(p.flags & MF_SHOOTABLE) || !Collision.checkSight(world, mo, p)) return false;
    const angle = asU32(Collision.angleTo(mo.x, mo.y, p.x, p.y) - mo.angle);
    if (
      angle > ANG90 &&
      angle < ANG270 &&
      Collision.approxDistance(p.x - mo.x, p.y - mo.y) > MELEERANGE
    ) {
      return false;
    }
    mo.target = p;
    return true;
  }

  private static chase(world: World, mo: Mobj, player: Mobj, game: Game): void {
    if (mo.reactiontime) --mo.reactiontime;
    const target = mo.target ?? player;
    if (!target || target.health <= 0 || !(target.flags & MF_SHOOTABLE)) {
      mo.target = null;
      mo.aiState = "look";
      mo.frame = 0;
      mo.tics = 10;
      return;
    }
    mo.target = target;
    if (mo.justAttacked) {
      mo.justAttacked = false;
      Enemy.newChaseDir(world, mo, game);
      return;
    }
    if (mo.movedir === Enemy.DI_NODIR) Enemy.newChaseDir(world, mo, game);
    Enemy.faceMoveDir(mo);
    const dist = Collision.approxDistance(target.x - mo.x, target.y - mo.y);
    const prof: Profile = Enemy.profiles()[mo.type] ?? [8, "hitscan", null, null, null, 7, 5, 3];
    const speed = prof[0];
    const attack = prof[1];
    const sfx = prof[4];
    if (attack === "none") return;
    const melee = ["melee", "imp", "baron", "caco"].includes(attack);
    const missile = ["hitscan", "shotgun", "imp", "baron", "caco"].includes(attack);
    if (
      melee &&
      dist < MELEERANGE - 20 * FRACUNIT + target.radius &&
      Collision.checkSight(world, mo, target)
    ) {
      if (sfx) game.startSound(sfx);
      Enemy.startAttack(mo, "melee");
      return;
    }
    if (missile && mo.movecount === 0 && Enemy.missileOk(world, mo, target, dist, melee)) {
      Enemy.startAttack(mo, attack);
      mo.justAttacked = true;
      return;
    }
    if (--mo.movecount < 0 || !Enemy.move(world, mo, speed, game)) Enemy.newChaseDir(world, mo, game);
    mo.frame = (mo.frame + 1) % 4;
  }

  private static missileOk(w: World, mo: Mobj, target: Mobj, dist: number, melee: boolean): boolean {
    if (!Collision.checkSight(w, mo, target) || mo.reactiontime) return false;
    let d = dist - 64 * FRACUNIT;
    if (!melee) d -= 128 * FRACUNIT;
    d >>= 16;
    if (d < 0) return true;
    return Enemy.random() >= Math.min(200, d);
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
      mo.aiState = "chase";
      mo.frame = 0;
      mo.movecount = 15 + (Enemy.random() & 15);
    }
  }

  private static doAttack(world: World, mo: Mobj, game: Game): void {
    const kind = mo.attackKind;
    const saved = mo.angle;
    Enemy.faceTarget(mo, mo.target!);
    const target = mo.target!;
    if (kind === "melee") {
      if (Collision.approxDistance(target.x - mo.x, target.y - mo.y) < MELEERANGE + mo.radius) {
        game.damageMobj(target, mo, ((Enemy.random() % 8) + 1) * 3);
      }
    } else if (kind === "shotgun") {
      game.startSound("shotgn");
      for (let i = 0; i < 3; ++i) {
        mo.angle = asU32(saved + ((Enemy.random() - Enemy.random()) << 20));
        Collision.lineAttack(world, mo, ((Enemy.random() % 5) + 1) * 3, game, MISSILERANGE);
      }
      mo.angle = saved;
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
        );
      }
    } else {
      game.startSound("pistol");
      mo.angle = asU32(saved + ((Enemy.random() - Enemy.random()) << 20));
      Collision.lineAttack(world, mo, ((Enemy.random() % 5) + 1) * 3, game, MISSILERANGE);
      mo.angle = saved;
    }
  }

  private static faceTarget(mo: Mobj, t: Mobj): void {
    mo.angle = Collision.angleTo(mo.x, mo.y, t.x, t.y);
  }

  private static faceMoveDir(mo: Mobj): void {
    if (mo.movedir < 0 || mo.movedir >= 8) return;
    const want = asU32(mo.movedir * ANG45);
    const delta = asU32(want - mo.angle);
    if (!delta) return;
    const step = intdiv(ANG45, 2);
    mo.angle =
      delta < 0x80000000
        ? asU32(mo.angle + Math.min(step, delta))
        : asU32(mo.angle - Math.min(step, 0x100000000 - delta));
  }

  private static move(world: World, mo: Mobj, speed: number, game: Game): boolean {
    if (mo.movedir < 0 || mo.movedir >= 8) return false;
    const nx = mo.x + speed * Enemy.XSPEED[mo.movedir]!;
    const ny = mo.y + speed * Enemy.YSPEED[mo.movedir]!;
    const chk = Collision.checkPosition(world, mo, nx, ny);
    if (!Collision.tryMove(world, mo, nx, ny, game)) {
      for (const ln of chk.spechit) if (ln.special) game.useSpecial(ln, mo, 0);
      return false;
    }
    mo.z = mo.floorz;
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
    const speed = Enemy.profiles()[mo.type]?.[0] ?? 8;
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
    speed: number,
    damage: number,
  ): void {
    const a = Collision.angleTo(src.x, src.y, dest.x, dest.y);
    const dist = Collision.approxDistance(dest.x - src.x, dest.y - src.y);
    const steps = Math.max(1, speed ? intdiv(dist, speed) : 1);
    const mo = new Mobj({
      x: src.x + fixedMul(12 * FRACUNIT, fineCos(a)),
      y: src.y + fixedMul(12 * FRACUNIT, fineSin(a)),
      z: src.z + 32 * FRACUNIT,
      angle: a,
      momx: fixedMul(speed, fineCos(a)),
      momy: fixedMul(speed, fineSin(a)),
      momz: Math.trunc((dest.z - src.z) / steps),
      radius: 6 * FRACUNIT,
      height: 8 * FRACUNIT,
      floorz: src.floorz,
      ceilingz: src.ceilingz,
      flags: MF_MISSILE | MF_DROPOFF | MF_NOGRAVITY,
      health: 1000,
      type: 0,
      sprite,
      info: ["missile", null],
      damage,
      aiState: "missile",
      target: src,
    });
    mo.x += mo.momx >> 1;
    mo.y += mo.momy >> 1;
    mo.z += mo.momz >> 1;
    world.mobjs.push(mo);
  }

  private static tickMissile(world: World, mo: Mobj, game: Game): void {
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
    if (hit) game.damageMobj(hit, mo.target ?? mo, mo.damage * ((Enemy.random() % 8) + 1), mo);
    game.startSound("firxpl");
    const i = world.mobjs.indexOf(mo);
    if (i !== -1) world.mobjs.splice(i, 1);
  }

  private static explodeBarrel(world: World, barrel: Mobj, game: Game): void {
    for (const o of [...world.mobjs]) {
      if (o === barrel || !(o.flags & MF_SHOOTABLE)) continue;
      const d = Math.max(0, Collision.approxDistance(o.x - barrel.x, o.y - barrel.y) - o.radius);
      if (d < 128 * FRACUNIT) game.damageMobj(o, barrel, (128 * FRACUNIT - d) >> 16);
    }
  }
}

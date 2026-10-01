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

import { asI32, asU32, fixedDiv, fixedMul, intdiv, shar } from "./compat.ts";
import {
  ANG90,
  ANG180,
  BOXBOTTOM,
  BOXLEFT,
  BOXRIGHT,
  BOXTOP,
  FRACBITS,
  FRACUNIT,
  MAPBLOCKSHIFT,
  MAPBLOCKSIZE,
  MAPBTOFRAC,
  MAXMOVE,
  MAXRADIUS,
  MAXSTEP,
  MELEERANGE,
  MF_DROPOFF,
  MF_FLOAT,
  MF_MISSILE,
  MF_NOBLOCKMAP,
  MF_NOBLOOD,
  MF_NOCLIP,
  MF_PICKUP,
  MF_SHOOTABLE,
  MF_SKULLFLY,
  MF_SOLID,
  MF_SPECIAL,
  MF_TELEPORT,
  ML_BLOCKING,
  ML_BLOCKMONSTERS,
  ML_TWOSIDED,
  NF_SUBSECTOR,
  PT_ADDLINES,
  PT_ADDTHINGS,
  PT_EARLYOUT,
  USERANGE,
} from "./defs.ts";
import { Enemy } from "./enemy.ts";
import type { Game } from "./game.ts";
import {
  MI_SPAWNSTATE,
  MOBJINFO,
  MT_BLOOD,
  MT_BRUISER,
  MT_KNIGHT,
  MT_PLAYER,
  MT_PUFF,
  S_BLOOD2,
  S_BLOOD3,
  S_PUFF3,
} from "./info.ts";
import type { Mobj } from "./mobj.ts";
import type { Player } from "./player.ts";
import { fineCos, fineSin, slopeDiv, tantoangle } from "./tables.ts";
import { Thinker } from "./thinker.ts";
import type { Line, Node, Sector, Subsector, World } from "./world.ts";

export class MoveCheck {
  floorz = 0;
  ceilingz = 0;
  dropoffz = 0;
  spechit: Line[] = [];
  blocked = false;
  hitThing: Mobj | null = null;
  ceilingline: Line | null = null;
  bbox: number[] = [0, 0, 0, 0];
}

interface DivLine {
  x: number;
  y: number;
  dx: number;
  dy: number;
}

interface Intercept {
  frac: number;
  isaline: boolean;
  line: Line | null;
  thing: Mobj | null;
}

export class Collision {
  static floatOk = false;
  static tmFloorZ = 0;
  static lastSpechit: Line[] = [];
  static ceilingLine: Line | null = null;
  private static earlyout = false;
  private static readonly intercepts: Intercept[] = [];
  private static readonly trace = { x: 0, y: 0, dx: 0, dy: 0 };
  private static readonly INT_MAX = 0x7fffffff;

  static pointOnSide(x: number, y: number, node: Node): number {
    const dx = asI32(x - node.x);
    const dy = asI32(y - node.y);
    const left = asI32(node.dy >> 16) * dx;
    const right = dy * asI32(node.dx >> 16);
    return right >= left ? 1 : 0;
  }

  static pointInSubsector(world: World, x: number, y: number): Subsector {
    let num = world.numnodes - 1;
    if (num < 0) return world.subsectors[0]!;
    while ((num & NF_SUBSECTOR) === 0) {
      const node = world.nodes[num]!;
      num = node.children[Collision.pointOnSide(x, y, node)]!;
    }
    return world.subsectors[num & ~NF_SUBSECTOR]!;
  }

  static pointOnLineSide(x: number, y: number, line: Line): number {
    if (line.dx === 0) {
      if (x <= line.v1!.x) return line.dy > 0 ? 1 : 0;
      return line.dy < 0 ? 1 : 0;
    }
    if (line.dy === 0) {
      if (y <= line.v1!.y) return line.dx < 0 ? 1 : 0;
      return line.dx > 0 ? 1 : 0;
    }
    const dx = asI32(x - line.v1!.x);
    const dy = asI32(y - line.v1!.y);
    const left = fixedMul(line.dy >> FRACBITS, dx);
    const right = fixedMul(dy, line.dx >> FRACBITS);
    return right < left ? 0 : 1;
  }

  static boxOnLineSide(box: number[], line: Line): number {
    let p1: number;
    let p2: number;
    if (line.dx === 0) {
      p1 = box[BOXRIGHT]! < line.v1!.x ? 0 : 1;
      p2 = box[BOXLEFT]! < line.v1!.x ? 0 : 1;
      if (line.dy > 0) {
        p1 ^= 1;
        p2 ^= 1;
      }
    } else if (line.dy === 0) {
      p1 = box[BOXTOP]! > line.v1!.y ? 0 : 1;
      p2 = box[BOXBOTTOM]! > line.v1!.y ? 0 : 1;
      if (line.dx < 0) {
        p1 ^= 1;
        p2 ^= 1;
      }
    } else if (line.dy > 0 === line.dx > 0) {
      p1 = Collision.pointOnLineSide(box[BOXLEFT]!, box[BOXTOP]!, line);
      p2 = Collision.pointOnLineSide(box[BOXRIGHT]!, box[BOXBOTTOM]!, line);
    } else {
      p1 = Collision.pointOnLineSide(box[BOXRIGHT]!, box[BOXTOP]!, line);
      p2 = Collision.pointOnLineSide(box[BOXLEFT]!, box[BOXBOTTOM]!, line);
    }
    return p1 === p2 ? p1 : -1;
  }

  static lineOpening(line: Line): [number, number, number] {
    if (line.backsector === null) return [0, 0, 0];
    const front = line.frontsector!;
    const back = line.backsector;
    const top = Math.min(front.ceilingheight, back.ceilingheight);
    return front.floorheight > back.floorheight
      ? [top, front.floorheight, back.floorheight]
      : [top, back.floorheight, front.floorheight];
  }

  static unsetThingPosition(world: World, thing: Mobj): void {
    if (!thing.blocklinked) return;
    const nxt = thing.bnext;
    const prev = thing.bprev;
    if (nxt) nxt.bprev = prev;
    if (prev) prev.bnext = nxt;
    else if (world.blocklinks[thing.bindex] === thing) world.blocklinks[thing.bindex] = nxt;
    thing.bnext = null;
    thing.bprev = null;
    thing.blocklinked = false;
  }

  static setThingPosition(world: World, thing: Mobj): void {
    thing.bnext = null;
    thing.bprev = null;
    thing.blocklinked = false;
    if (thing.flags & MF_NOBLOCKMAP || world.blocklinks.length === 0) return;
    const bx = shar(thing.x - world.bmaporgx, MAPBLOCKSHIFT);
    const by = shar(thing.y - world.bmaporgy, MAPBLOCKSHIFT);
    if (bx < 0 || by < 0 || bx >= world.bmapwidth || by >= world.bmapheight) return;
    const i = by * world.bmapwidth + bx;
    const head = world.blocklinks[i] ?? null;
    thing.bnext = head;
    if (head) head.bprev = thing;
    world.blocklinks[i] = thing;
    thing.bindex = i;
    thing.blocklinked = true;
  }

  private static blockThings(world: World, x: number, y: number, func: (mo: Mobj) => boolean): boolean {
    if (x < 0 || y < 0 || x >= world.bmapwidth || y >= world.bmapheight) return true;
    let mo = world.blocklinks[y * world.bmapwidth + x] ?? null;
    while (mo) {
      const nxt = mo.bnext;
      if (!func(mo)) return false;
      mo = nxt;
    }
    return true;
  }

  private static blockLines(world: World, x: number, y: number, func: (ln: Line) => boolean): boolean {
    if (x < 0 || y < 0 || x >= world.bmapwidth || y >= world.bmapheight) return true;
    let offset = world.blockmap[y * world.bmapwidth + x] ?? 0;
    const lump = world.blockmapShorts;
    while (offset >= 0 && offset < lump.length) {
      const n = lump[offset]!;
      offset++;
      if (n === 0xffff) return true;
      if (n >= world.lines.length) continue;
      const ld = world.lines[n]!;
      if (ld.validcount === world.validcount) continue;
      ld.validcount = world.validcount;
      if (!func(ld)) return false;
    }
    return true;
  }

  private static sameSpecies(target: Mobj, other: Mobj): boolean {
    if (target.type === other.type) return true;
    if (target.type === MT_KNIGHT && other.type === MT_BRUISER) return true;
    return target.type === MT_BRUISER && other.type === MT_KNIGHT;
  }

  private static pitThing(world: World, tm: Mobj, other: Mobj, game: Game | null): boolean {
    if ((other.flags & (MF_SOLID | MF_SPECIAL | MF_SHOOTABLE)) === 0) return true;
    const dist = other.radius + tm.radius;
    if (Math.abs(other.x - tm.tmx) >= dist || Math.abs(other.y - tm.tmy) >= dist) return true;
    if (other === tm) return true;
    if (tm.flags & MF_SKULLFLY) {
      if (game) game.damageMobj(other, tm, ((Enemy.publicRandom() % 8) + 1) * (tm.damage || 0), tm);
      tm.flags &= ~MF_SKULLFLY;
      tm.momx = tm.momy = tm.momz = 0;
      Thinker.setMobjState(tm, Number(MOBJINFO[tm.type]![MI_SPAWNSTATE]), world, game);
      return false;
    }
    if (tm.flags & MF_MISSILE) {
      if (tm.z > other.z + other.height || tm.z + tm.height < other.z) return true;
      if (tm.target && Collision.sameSpecies(tm.target, other)) {
        if (other === tm.target) return true;
        if (other.type !== MT_PLAYER) return false;
      }
      if ((other.flags & MF_SHOOTABLE) === 0) return (other.flags & MF_SOLID) === 0;
      if (game)
        game.damageMobj(other, tm.target ?? tm, ((Enemy.publicRandom() % 8) + 1) * (tm.damage || 0), tm);
      return false;
    }
    if (other.flags & MF_SPECIAL) {
      const solid = other.flags & MF_SOLID;
      if (tm.flags & MF_PICKUP && game) game.touchSpecial(other, tm);
      return solid === 0;
    }
    return (other.flags & MF_SOLID) === 0;
  }

  private static pitLine(tm: Mobj, chk: MoveCheck, ld: Line): boolean {
    const box = chk.bbox;
    if (
      box[BOXRIGHT]! <= ld.bbox[BOXLEFT]! ||
      box[BOXLEFT]! >= ld.bbox[BOXRIGHT]! ||
      box[BOXTOP]! <= ld.bbox[BOXBOTTOM]! ||
      box[BOXBOTTOM]! >= ld.bbox[BOXTOP]!
    )
      return true;
    if (Collision.boxOnLineSide(box, ld) !== -1) return true;
    if (ld.backsector === null) return false;
    if ((tm.flags & MF_MISSILE) === 0) {
      if (ld.flags & ML_BLOCKING) return false;
      if (tm.player === null && ld.flags & ML_BLOCKMONSTERS) return false;
    }
    const [top, bottom, low] = Collision.lineOpening(ld);
    if (top < chk.ceilingz) {
      chk.ceilingz = top;
      chk.ceilingline = ld;
    }
    if (bottom > chk.floorz) chk.floorz = bottom;
    if (low < chk.dropoffz) chk.dropoffz = low;
    if (ld.special) chk.spechit.push(ld);
    return true;
  }

  static checkPosition(world: World, thing: Mobj, x: number, y: number, game: Game | null = null): MoveCheck {
    const chk = new MoveCheck();
    thing.tmx = x;
    thing.tmy = y;
    const r = thing.radius;
    const box = chk.bbox;
    box[BOXLEFT] = x - r;
    box[BOXRIGHT] = x + r;
    box[BOXBOTTOM] = y - r;
    box[BOXTOP] = y + r;
    const sec = Collision.pointInSubsector(world, x, y).sector!;
    chk.floorz = chk.dropoffz = sec.floorheight;
    chk.ceilingz = sec.ceilingheight;
    world.validcount++;
    if (thing.flags & MF_NOCLIP || world.blocklinks.length === 0) return chk;
    const orgx = world.bmaporgx;
    const orgy = world.bmaporgy;
    let xl = shar(box[BOXLEFT]! - orgx - MAXRADIUS, MAPBLOCKSHIFT);
    let xh = shar(box[BOXRIGHT]! - orgx + MAXRADIUS, MAPBLOCKSHIFT);
    let yl = shar(box[BOXBOTTOM]! - orgy - MAXRADIUS, MAPBLOCKSHIFT);
    let yh = shar(box[BOXTOP]! - orgy + MAXRADIUS, MAPBLOCKSHIFT);
    for (let bx = xl; bx <= xh; bx++) {
      for (let by = yl; by <= yh; by++) {
        if (!Collision.blockThings(world, bx, by, (th) => Collision.pitThing(world, thing, th, game))) {
          chk.blocked = true;
          return chk;
        }
      }
    }
    xl = shar(box[BOXLEFT]! - orgx, MAPBLOCKSHIFT);
    xh = shar(box[BOXRIGHT]! - orgx, MAPBLOCKSHIFT);
    yl = shar(box[BOXBOTTOM]! - orgy, MAPBLOCKSHIFT);
    yh = shar(box[BOXTOP]! - orgy, MAPBLOCKSHIFT);
    for (let bx = xl; bx <= xh; bx++) {
      for (let by = yl; by <= yh; by++) {
        if (!Collision.blockLines(world, bx, by, (ld) => Collision.pitLine(thing, chk, ld))) {
          chk.blocked = true;
          return chk;
        }
      }
    }
    return chk;
  }

  static tryMove(world: World, thing: Mobj, x: number, y: number, game: Game | null = null): boolean {
    Collision.floatOk = false;
    Collision.ceilingLine = null;
    const chk = Collision.checkPosition(world, thing, x, y, game);
    Collision.lastSpechit = chk.spechit;
    Collision.tmFloorZ = chk.floorz;
    Collision.ceilingLine = chk.ceilingline;
    if (chk.blocked) return false;
    if ((thing.flags & MF_NOCLIP) === 0) {
      if (chk.ceilingz - chk.floorz < thing.height) return false;
      Collision.floatOk = true;
      if ((thing.flags & MF_TELEPORT) === 0 && chk.ceilingz - thing.z < thing.height) return false;
      if ((thing.flags & MF_TELEPORT) === 0 && chk.floorz - thing.z > MAXSTEP) return false;
      if ((thing.flags & (MF_DROPOFF | MF_FLOAT)) === 0 && chk.floorz - chk.dropoffz > MAXSTEP) return false;
    }
    Collision.unsetThingPosition(world, thing);
    const oldx = thing.x;
    const oldy = thing.y;
    thing.floorz = chk.floorz;
    thing.ceilingz = chk.ceilingz;
    thing.x = x;
    thing.y = y;
    Collision.setThingPosition(world, thing);
    if (game !== null && (thing.flags & (MF_TELEPORT | MF_NOCLIP)) === 0) {
      for (let i = chk.spechit.length - 1; i >= 0; i--) {
        const ln = chk.spechit[i]!;
        const side = Collision.pointOnLineSide(thing.x, thing.y, ln);
        const oldside = Collision.pointOnLineSide(oldx, oldy, ln);
        if (side !== oldside && ln.special) game.crossSpecial(ln, oldside, thing);
      }
    }
    return true;
  }

  private static divTrace(): DivLine {
    return {
      x: Collision.trace.x,
      y: Collision.trace.y,
      dx: Collision.trace.dx,
      dy: Collision.trace.dy,
    };
  }

  /** P_PointOnDivlineSide. */
  private static pointOnDivlineSide(x: number, y: number, line: DivLine): number {
    if (line.dx === 0) {
      if (x <= line.x) return line.dy > 0 ? 1 : 0;
      return line.dy < 0 ? 1 : 0;
    }
    if (line.dy === 0) {
      if (y <= line.y) return line.dx < 0 ? 1 : 0;
      return line.dx > 0 ? 1 : 0;
    }
    const dx = x - line.x;
    const dy = y - line.y;
    const xor = asU32(asU32(line.dy) ^ asU32(line.dx) ^ asU32(dx) ^ asU32(dy));
    if (xor & 0x80000000) return (asU32(asU32(line.dy) ^ asU32(dx)) & 0x80000000) ? 1 : 0;
    const left = fixedMul(shar(line.dy, 8), shar(dx, 8));
    const right = fixedMul(shar(dy, 8), shar(line.dx, 8));
    return right < left ? 0 : 1;
  }

  /** P_InterceptVector: frac of v2 along v1. */
  private static interceptVector(v2: DivLine, v1: DivLine): number {
    const den = asI32(fixedMul(shar(v1.dy, 8), v2.dx) - fixedMul(shar(v1.dx, 8), v2.dy));
    if (den === 0) return 0;
    const num = asI32(
      fixedMul(shar(v1.x - v2.x, 8), v1.dy) + fixedMul(shar(v2.y - v1.y, 8), v1.dx),
    );
    return fixedDiv(num, den);
  }

  private static addLineIntercept(ld: Line): boolean {
    const big = 16 * FRACUNIT;
    const dx = Collision.trace.dx;
    const dy = Collision.trace.dy;
    let s1: number;
    let s2: number;
    if (dx > big || dy > big || dx < -big || dy < -big) {
      const tr = Collision.divTrace();
      s1 = Collision.pointOnDivlineSide(ld.v1!.x, ld.v1!.y, tr);
      s2 = Collision.pointOnDivlineSide(ld.v2!.x, ld.v2!.y, tr);
    } else {
      s1 = Collision.pointOnLineSide(Collision.trace.x, Collision.trace.y, ld);
      s2 = Collision.pointOnLineSide(Collision.trace.x + dx, Collision.trace.y + dy, ld);
    }
    if (s1 === s2) return true;
    const frac = Collision.interceptVector(Collision.divTrace(), {
      x: ld.v1!.x,
      y: ld.v1!.y,
      dx: ld.dx,
      dy: ld.dy,
    });
    if (frac < 0) return true;
    if (Collision.earlyout && frac < FRACUNIT && ld.backsector === null) return false;
    Collision.intercepts.push({ frac, isaline: true, line: ld, thing: null });
    return true;
  }

  private static addThingIntercept(thing: Mobj): boolean {
    const tr = Collision.divTrace();
    const positive = asI32(asU32(tr.dx) ^ asU32(tr.dy)) > 0;
    const x1 = thing.x - thing.radius;
    const x2 = thing.x + thing.radius;
    const y1 = positive ? thing.y + thing.radius : thing.y - thing.radius;
    const y2 = positive ? thing.y - thing.radius : thing.y + thing.radius;
    if (Collision.pointOnDivlineSide(x1, y1, tr) === Collision.pointOnDivlineSide(x2, y2, tr)) return true;
    const frac = Collision.interceptVector(tr, { x: x1, y: y1, dx: x2 - x1, dy: y2 - y1 });
    if (frac < 0) return true;
    Collision.intercepts.push({ frac, isaline: false, line: null, thing });
    return true;
  }

  /** Smallest frac wins; a strict < keeps the earlier intercept when fracs are equal. */
  private static traverseIntercepts(func: (inn: Intercept) => boolean, maxfrac: number): boolean {
    let count = Collision.intercepts.length;
    while (count > 0) {
      count -= 1;
      let dist = Collision.INT_MAX;
      let chosen: Intercept | null = null;
      for (const scan of Collision.intercepts) {
        if (scan.frac < dist) {
          dist = scan.frac;
          chosen = scan;
        }
      }
      if (dist > maxfrac) return true;
      if (chosen === null || !func(chosen)) return false;
      chosen.frac = Collision.INT_MAX;
    }
    return true;
  }

  private static abs32(n: number): number {
    n = asI32(n);
    return n < 0 ? -n : n;
  }

  /** P_PathTraverse: blockmap DDA, then intercepts from nearest to farthest. */
  static pathTraverse(
    world: World,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    flags: number,
    trav: (inn: Intercept) => boolean,
  ): boolean {
    Collision.earlyout = (flags & PT_EARLYOUT) !== 0;
    world.validcount += 1;
    Collision.intercepts.length = 0;
    const orgx = world.bmaporgx;
    const orgy = world.bmaporgy;
    if ((asI32(x1 - orgx) & (MAPBLOCKSIZE - 1)) === 0) x1 += FRACUNIT;
    if ((asI32(y1 - orgy) & (MAPBLOCKSIZE - 1)) === 0) y1 += FRACUNIT;
    Collision.trace.x = x1;
    Collision.trace.y = y1;
    Collision.trace.dx = asI32(x2 - x1);
    Collision.trace.dy = asI32(y2 - y1);
    x1 = asI32(x1 - orgx);
    y1 = asI32(y1 - orgy);
    const xt1 = shar(x1, MAPBLOCKSHIFT);
    const yt1 = shar(y1, MAPBLOCKSHIFT);
    const x2m = asI32(x2 - orgx);
    const y2m = asI32(y2 - orgy);
    const xt2 = shar(x2m, MAPBLOCKSHIFT);
    const yt2 = shar(y2m, MAPBLOCKSHIFT);
    let mapxstep: number;
    let partial: number;
    let ystep: number;
    if (xt2 > xt1) {
      mapxstep = 1;
      partial = FRACUNIT - (shar(x1, MAPBTOFRAC) & (FRACUNIT - 1));
      ystep = fixedDiv(asI32(y2m - y1), Collision.abs32(asI32(x2m - x1)));
    } else if (xt2 < xt1) {
      mapxstep = -1;
      partial = shar(x1, MAPBTOFRAC) & (FRACUNIT - 1);
      ystep = fixedDiv(asI32(y2m - y1), Collision.abs32(asI32(x2m - x1)));
    } else {
      mapxstep = 0;
      partial = FRACUNIT;
      ystep = 256 * FRACUNIT;
    }
    let yintercept = asI32(shar(y1, MAPBTOFRAC) + fixedMul(partial, ystep));
    let mapystep: number;
    let xstep: number;
    if (yt2 > yt1) {
      mapystep = 1;
      partial = FRACUNIT - (shar(y1, MAPBTOFRAC) & (FRACUNIT - 1));
      xstep = fixedDiv(asI32(x2m - x1), Collision.abs32(asI32(y2m - y1)));
    } else if (yt2 < yt1) {
      mapystep = -1;
      partial = shar(y1, MAPBTOFRAC) & (FRACUNIT - 1);
      xstep = fixedDiv(asI32(x2m - x1), Collision.abs32(asI32(y2m - y1)));
    } else {
      mapystep = 0;
      partial = FRACUNIT;
      xstep = 256 * FRACUNIT;
    }
    let xintercept = asI32(shar(x1, MAPBTOFRAC) + fixedMul(partial, xstep));
    let mapx = xt1;
    let mapy = yt1;
    for (let count = 0; count < 64; count++) {
      if (flags & PT_ADDLINES) {
        if (!Collision.blockLines(world, mapx, mapy, (ld) => Collision.addLineIntercept(ld))) return false;
      }
      if (flags & PT_ADDTHINGS) {
        if (!Collision.blockThings(world, mapx, mapy, (th) => Collision.addThingIntercept(th))) return false;
      }
      if (mapx === xt2 && mapy === yt2) break;
      if (shar(yintercept, FRACBITS) === mapy) {
        yintercept = asI32(yintercept + ystep);
        mapx += mapxstep;
      } else if (shar(xintercept, FRACBITS) === mapx) {
        xintercept = asI32(xintercept + xstep);
        mapy += mapystep;
      }
    }
    return Collision.traverseIntercepts(trav, FRACUNIT);
  }

  /** P_HitSlideLine: keep the part of the move that runs along the wall. */
  private static hitSlideLine(thing: Mobj, line: Line, tmx: number, tmy: number): [number, number] {
    if (line.dy === 0) return [tmx, 0];
    if (line.dx === 0) return [0, tmy];
    let lineangle = Collision.angleTo(0, 0, line.dx, line.dy);
    if (Collision.pointOnLineSide(thing.x, thing.y, line) === 1) lineangle = asU32(lineangle + ANG180);
    const moveangle = Collision.angleTo(0, 0, tmx, tmy);
    let delta = asU32(moveangle - lineangle);
    if (delta > ANG180) delta = asU32(delta + ANG180);
    const newlen = fixedMul(Collision.approxDistance(tmx, tmy), fineCos(delta));
    return [fixedMul(newlen, fineCos(lineangle)), fixedMul(newlen, fineSin(lineangle))];
  }

  private static stairstep(world: World, thing: Mobj, game: Game | null): void {
    if (!Collision.tryMove(world, thing, thing.x, thing.y + thing.momy, game)) {
      Collision.tryMove(world, thing, thing.x + thing.momx, thing.y, game);
    }
  }

  /** P_SlideMove: ride the wall. The caller already tried the move. */
  static slideMove(
    world: World,
    thing: Mobj,
    momx: number,
    momy: number,
    game: Game | null = null,
  ): void {
    if (Math.abs(momx) > MAXMOVE) momx = momx > 0 ? MAXMOVE : -MAXMOVE;
    if (Math.abs(momy) > MAXMOVE) momy = momy > 0 ? MAXMOVE : -MAXMOVE;
    thing.momx = momx;
    thing.momy = momy;
    let hitcount = 0;
    while (true) {
      hitcount += 1;
      if (hitcount === 3) {
        Collision.stairstep(world, thing, game);
        return;
      }
      const leadx = thing.momx > 0 ? thing.x + thing.radius : thing.x - thing.radius;
      const trailx = thing.momx > 0 ? thing.x - thing.radius : thing.x + thing.radius;
      const leady = thing.momy > 0 ? thing.y + thing.radius : thing.y - thing.radius;
      const traily = thing.momy > 0 ? thing.y - thing.radius : thing.y + thing.radius;
      const best = { frac: FRACUNIT + 1, line: null as Line | null };
      const slideTrav = (inn: Intercept): boolean => {
        const li = inn.line!;
        let blocking = false;
        if ((li.flags & ML_TWOSIDED) === 0) {
          if (Collision.pointOnLineSide(thing.x, thing.y, li) !== 0) return true;
          blocking = true;
        } else {
          const [opentop, openbottom] = Collision.lineOpening(li);
          if (opentop - openbottom < thing.height) blocking = true;
          else if (opentop - thing.z < thing.height) blocking = true;
          else if (openbottom - thing.z > 24 * FRACUNIT) blocking = true;
        }
        if (!blocking) return true;
        if (inn.frac < best.frac) {
          best.frac = inn.frac;
          best.line = li;
        }
        return false;
      };
      const mx = thing.momx;
      const my = thing.momy;
      Collision.pathTraverse(world, leadx, leady, leadx + mx, leady + my, PT_ADDLINES, slideTrav);
      Collision.pathTraverse(world, trailx, leady, trailx + mx, leady + my, PT_ADDLINES, slideTrav);
      Collision.pathTraverse(world, leadx, traily, leadx + mx, traily + my, PT_ADDLINES, slideTrav);
      if (best.frac === FRACUNIT + 1 || best.line === null) {
        Collision.stairstep(world, thing, game);
        return;
      }
      best.frac -= 0x800;
      if (best.frac > 0) {
        const newx = fixedMul(thing.momx, best.frac);
        const newy = fixedMul(thing.momy, best.frac);
        if (!Collision.tryMove(world, thing, thing.x + newx, thing.y + newy, game)) {
          Collision.stairstep(world, thing, game);
          return;
        }
      }
      best.frac = FRACUNIT - (best.frac + 0x800);
      if (best.frac > FRACUNIT) best.frac = FRACUNIT;
      if (best.frac <= 0) return;
      let tmx = fixedMul(thing.momx, best.frac);
      let tmy = fixedMul(thing.momy, best.frac);
      [tmx, tmy] = Collision.hitSlideLine(thing, best.line, tmx, tmy);
      thing.momx = tmx;
      thing.momy = tmy;
      if (Collision.tryMove(world, thing, thing.x + tmx, thing.y + tmy, game)) return;
    }
  }

  static interceptFrac(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    line: Line,
  ): number | null {
    const u = FRACUNIT;
    const ax = x1 / u;
    const ay = y1 / u;
    const bx = x2 / u;
    const by = y2 / u;
    const cx = line.v1!.x / u;
    const cy = line.v1!.y / u;
    const dx = line.v2!.x / u;
    const dy = line.v2!.y / u;
    const den = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
    if (Math.abs(den) < 1e-8) return null;
    const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / den;
    const v = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / den;
    return t < 0 || t > 1 || v < 0 || v > 1 ? null : Math.trunc(t * u);
  }

  static useLines(world: World, player: Player, game: Game): void {
    const mo = player.mo!;
    const x1 = mo.x;
    const y1 = mo.y;
    const x2 = x1 + shar(USERANGE, FRACBITS) * fineCos(mo.angle);
    const y2 = y1 + shar(USERANGE, FRACBITS) * fineSin(mo.angle);
    const use = (inn: Intercept): boolean => {
      const ln = inn.line!;
      if (!ln.special) {
        const [opentop, openbottom] = Collision.lineOpening(ln);
        if (opentop - openbottom <= 0) {
          game.startSound("noway");
          return false;
        }
        return true;
      }
      const side = Collision.pointOnLineSide(mo.x, mo.y, ln) === 1 ? 1 : 0;
      game.useSpecial(ln, mo, side);
      return false;
    };
    Collision.pathTraverse(world, x1, y1, x2, y2, PT_ADDLINES, use);
  }

  private static shotEnds(source: Mobj, angle: number, attackrange: number): [number, number, number] {
    const x2 = source.x + shar(attackrange, FRACBITS) * fineCos(angle);
    const y2 = source.y + shar(attackrange, FRACBITS) * fineSin(angle);
    const shootz = source.z + (source.height >> 1) + 8 * FRACUNIT;
    return [x2, y2, shootz];
  }

  /** PTR_AimTraverse over P_PathTraverse. Height window stays 100/160. */
  private static aim(
    world: World,
    source: Mobj,
    angle: number,
    range: number,
  ): { slope: number; target: Mobj | null } {
    const [x2, y2, shootz] = Collision.shotEnds(source, angle, range);
    const window = Math.trunc((100 * FRACUNIT) / 160);
    const state = { top: window, bottom: -window, slope: 0, target: null as Mobj | null };
    const trav = (inn: Intercept): boolean => {
      if (inn.isaline) {
        const li = inn.line!;
        if ((li.flags & ML_TWOSIDED) === 0) return false;
        const [opentop, openbottom] = Collision.lineOpening(li);
        if (openbottom >= opentop) return false;
        const dist = fixedMul(range, inn.frac);
        const front = li.frontsector;
        const back = li.backsector;
        if (back === null || front!.floorheight !== back.floorheight) {
          const slope = fixedDiv(openbottom - shootz, dist);
          if (slope > state.bottom) state.bottom = slope;
        }
        if (back === null || front!.ceilingheight !== back.ceilingheight) {
          const slope = fixedDiv(opentop - shootz, dist);
          if (slope < state.top) state.top = slope;
        }
        return state.top > state.bottom;
      }
      const th = inn.thing!;
      if (th === source || (th.flags & MF_SHOOTABLE) === 0) return true;
      const dist = fixedMul(range, inn.frac);
      let thingtop = fixedDiv(th.z + th.height - shootz, dist);
      if (thingtop < state.bottom) return true;
      let thingbot = fixedDiv(th.z - shootz, dist);
      if (thingbot > state.top) return true;
      if (thingtop > state.top) thingtop = state.top;
      if (thingbot < state.bottom) thingbot = state.bottom;
      state.slope = Math.floor((thingtop + thingbot) / 2);
      state.target = th;
      return false;
    };
    Collision.pathTraverse(world, source.x, source.y, x2, y2, PT_ADDLINES | PT_ADDTHINGS, trav);
    if (state.target !== null) return { slope: state.slope, target: state.target };
    return { slope: 0, target: null };
  }

  static aimSlope(world: World, source: Mobj, angle: number, range: number): number {
    return Collision.aim(world, source, angle, range).slope;
  }

  static bulletSlope(world: World, source: Mobj): number {
    const base = source.angle;
    const span = 16 * 64 * FRACUNIT;
    for (const ang of [base, asU32(base + (1 << 26)), asU32(base - (1 << 26))]) {
      const aimed = Collision.aim(world, source, ang, span);
      if (aimed.target) return aimed.slope;
    }
    return 0;
  }

  static lineAttack(
    world: World,
    source: Mobj,
    damage: number,
    game: Game | null,
    range: number,
    angle?: number,
    slope?: number,
  ): boolean {
    const ang = angle ?? source.angle;
    const aimslope = slope === undefined ? Collision.aim(world, source, ang, range).slope : slope;
    const [x2, y2, shootz] = Collision.shotEnds(source, ang, range);
    const sky = game?.res?.skyflatnum ?? -1;
    const hit = { ok: false };
    const shoot = (inn: Intercept): boolean => {
      if (inn.isaline) {
        const li = inn.line!;
        if (li.special && game !== null) game.shootSpecial(li, source);
        let hitLine = false;
        if ((li.flags & ML_TWOSIDED) === 0) {
          hitLine = true;
        } else {
          const [opentop, openbottom] = Collision.lineOpening(li);
          const dist = fixedMul(range, inn.frac);
          const front = li.frontsector;
          const back = li.backsector;
          if (back === null) {
            if (fixedDiv(openbottom - shootz, dist) > aimslope) hitLine = true;
            else if (fixedDiv(opentop - shootz, dist) < aimslope) hitLine = true;
          } else {
            if (front!.floorheight !== back.floorheight && fixedDiv(openbottom - shootz, dist) > aimslope) {
              hitLine = true;
            }
            if (
              !hitLine &&
              front!.ceilingheight !== back.ceilingheight &&
              fixedDiv(opentop - shootz, dist) < aimslope
            ) {
              hitLine = true;
            }
          }
        }
        if (!hitLine) return true;
        const frac = inn.frac - fixedDiv(4 * FRACUNIT, range);
        const x = Collision.trace.x + fixedMul(Collision.trace.dx, frac);
        const y = Collision.trace.y + fixedMul(Collision.trace.dy, frac);
        const z = shootz + fixedMul(aimslope, fixedMul(frac, range));
        const front = li.frontsector;
        if (front !== null && front.ceilingpic === sky) {
          if (z > front.ceilingheight) return false;
          if (li.backsector !== null && li.backsector.ceilingpic === sky) return false;
        }
        Collision.spawnPuff(world, x, y, z, game, range);
        return false;
      }
      const th = inn.thing!;
      if (th === source || (th.flags & MF_SHOOTABLE) === 0) return true;
      const dist = fixedMul(range, inn.frac);
      if (fixedDiv(th.z + th.height - shootz, dist) < aimslope) return true;
      if (fixedDiv(th.z - shootz, dist) > aimslope) return true;
      const frac = inn.frac - fixedDiv(10 * FRACUNIT, range);
      const x = Collision.trace.x + fixedMul(Collision.trace.dx, frac);
      const y = Collision.trace.y + fixedMul(Collision.trace.dy, frac);
      const z = shootz + fixedMul(aimslope, fixedMul(frac, range));
      if (th.flags & MF_NOBLOOD) Collision.spawnPuff(world, x, y, z, game, range);
      else Collision.spawnBlood(world, x, y, z, game, damage);
      if (game !== null && damage) game.damageMobj(th, source, damage, source);
      hit.ok = true;
      return false;
    };
    Collision.pathTraverse(world, source.x, source.y, x2, y2, PT_ADDLINES | PT_ADDTHINGS, shoot);
    return hit.ok;
  }

  private static spawnPuff(world: World, x: number, y: number, z: number, game: Game | null, range: number): void {
    z += (Enemy.publicRandom() - Enemy.publicRandom()) * 1024;
    const th = Thinker.spawnMobj(world, x, y, z, MT_PUFF, game);
    th.momz = FRACUNIT;
    th.tics -= Enemy.publicRandom() & 3;
    if (th.tics < 1) th.tics = 1;
    if (range === MELEERANGE) Thinker.setMobjState(th, S_PUFF3, world, game);
  }

  private static spawnBlood(world: World, x: number, y: number, z: number, game: Game | null, damage: number): void {
    z += (Enemy.publicRandom() - Enemy.publicRandom()) * 1024;
    const th = Thinker.spawnMobj(world, x, y, z, MT_BLOOD, game);
    th.momz = FRACUNIT * 2;
    th.tics -= Enemy.publicRandom() & 3;
    if (th.tics < 1) th.tics = 1;
    if (damage <= 12 && damage >= 9) Thinker.setMobjState(th, S_BLOOD2, world, game);
    else if (damage < 9) Thinker.setMobjState(th, S_BLOOD3, world, game);
  }

  static aimLineAttack(world: World, source: Mobj, angle: number, range: number): Mobj | null {
    return Collision.aim(world, source, angle, range).target;
  }

  static checkSight(world: World, a: Mobj, b: Mobj): boolean {
    const s1 = Collision.pointInSubsector(world, a.x, a.y).sector!;
    const s2 = Collision.pointInSubsector(world, b.x, b.y).sector!;
    const n = world.sectors.length;
    const rej = world.rejectmatrix;
    if (n && rej.length !== 0) {
      const p = s1.iSector * n + s2.iSector;
      const byte = p >> 3;
      if (byte < rej.length && rej[byte]! & (1 << (p & 7))) return false;
    }
    if (s1 === s2) return true;
    for (const ln of world.lines) {
      if (ln.backsector !== null) {
        const [top, bottom] = Collision.lineOpening(ln);
        if (top - bottom > 0) continue;
      }
      const f = Collision.interceptFrac(a.x, a.y, b.x, b.y, ln);
      if (f !== null && f > intdiv(FRACUNIT, 64) && f < FRACUNIT - intdiv(FRACUNIT, 64))
        return false;
    }
    return true;
  }

  static thingHeightClip(world: World, thing: Mobj): boolean {
    const onFloor = thing.z === thing.floorz;
    const chk = Collision.checkPosition(world, thing, thing.x, thing.y);
    thing.floorz = chk.floorz;
    thing.ceilingz = chk.ceilingz;
    if (onFloor) {
      thing.z = thing.floorz;
    } else if (thing.z + thing.height > thing.ceilingz) {
      thing.z = thing.ceilingz - thing.height;
    }
    if (thing.player !== null) {
      thing.player.viewz = thing.z + thing.player.viewheight;
    }
    return thing.ceilingz - thing.floorz >= thing.height;
  }

  static changeSector(world: World, sector: Sector, crush: boolean): boolean {
    let nofit = false;
    for (const thing of world.mobjs) {
      if (Collision.pointInSubsector(world, thing.x, thing.y).sector !== sector) continue;
      if (Collision.thingHeightClip(world, thing)) continue;
      if (thing.health <= 0) {
        thing.flags &= ~MF_SOLID;
        thing.height = 0;
        continue;
      }
      if ((thing.flags & MF_SHOOTABLE) === 0) continue;
      nofit = true;
      if (crush) {
        thing.health -= 10;
        if (thing.player) thing.player.health = thing.health;
        if (thing.health <= 0) {
          thing.flags &= ~MF_SOLID;
          thing.height = 0;
        }
      }
    }
    return nofit;
  }

  static approxDistance(dx: number, dy: number): number {
    dx = Math.abs(dx);
    dy = Math.abs(dy);
    if (dx < dy) [dx, dy] = [dy, dx];
    return dx + intdiv(dy, 2);
  }

  static angleTo(x1: number, y1: number, x2: number, y2: number): number {
    let x = asI32(x2 - x1);
    let y = asI32(y2 - y1);
    if (x === 0 && y === 0) return 0;
    const ta = tantoangle;
    if (x >= 0) {
      if (y >= 0)
        return x > y
          ? ta[slopeDiv(y, x)]!
          : asU32(ANG90 - 1 - ta[slopeDiv(x, y)]!);
      y = -y;
      return x > y ? asU32(-ta[slopeDiv(y, x)]!) : asU32(0xc0000000 + ta[slopeDiv(x, y)]!);
    }
    x = -x;
    if (y >= 0)
      return x > y
        ? asU32(ANG180 - 1 - ta[slopeDiv(y, x)]!)
        : asU32(ANG90 + ta[slopeDiv(x, y)]!);
    y = -y;
    return x > y
      ? asU32(ANG180 + ta[slopeDiv(y, x)]!)
      : asU32(0xc0000000 - 1 - ta[slopeDiv(x, y)]!);
  }
}

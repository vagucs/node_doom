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

import { asI32, asU32, fixedMul, intdiv, shar } from "./compat.ts";
import {
  ANG90,
  ANG180,
  BOXBOTTOM,
  BOXLEFT,
  BOXRIGHT,
  BOXTOP,
  FRACBITS,
  FRACUNIT,
  MAXMOVE,
  MAXSTEP,
  MF_DROPOFF,
  MF_FLOAT,
  MF_MISSILE,
  MF_NOCLIP,
  MF_PICKUP,
  MF_SHOOTABLE,
  MF_SOLID,
  MF_SPECIAL,
  ML_BLOCKING,
  ML_BLOCKMONSTERS,
  NF_SUBSECTOR,
  USERANGE,
} from "./defs.ts";
import { fineCos, fineSin, slopeDiv, tantoangle } from "./tables.ts";
import type { Game } from "./game.ts";
import type { Mobj } from "./mobj.ts";
import type { Player } from "./player.ts";
import type { Line, Node, Sector, Subsector, World } from "./world.ts";

export class MoveCheck {
  floorz = 0;
  ceilingz = 0;
  dropoffz = 0;
  spechit: Line[] = [];
  blocked = false;
  hitThing: Mobj | null = null;
}

export class Collision {
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

  private static thingBlocks(tm: Mobj, other: Mobj): boolean {
    if (other === tm || (tm.flags & MF_MISSILE && other === tm.target)) return false;
    if ((other.flags & (MF_SOLID | MF_SPECIAL | MF_SHOOTABLE)) === 0) return false;
    const dist = other.radius + tm.radius;
    if (Math.abs(other.x - tm.tmx) >= dist || Math.abs(other.y - tm.tmy) >= dist) return false;
    if (tm.z >= other.z + other.height || tm.z + tm.height <= other.z) return false;
    if (other.flags & MF_SPECIAL) {
      if (tm.flags & MF_PICKUP) tm.pickup = other;
      return (other.flags & MF_SOLID) !== 0;
    }
    return (other.flags & MF_SOLID) !== 0;
  }

  static checkPosition(world: World, thing: Mobj, x: number, y: number): MoveCheck {
    const chk = new MoveCheck();
    thing.tmx = x;
    thing.tmy = y;
    thing.pickup = null;
    const r = thing.radius;
    const box: number[] = [];
    box[BOXLEFT] = x - r;
    box[BOXRIGHT] = x + r;
    box[BOXBOTTOM] = y - r;
    box[BOXTOP] = y + r;
    const sec = Collision.pointInSubsector(world, x, y).sector!;
    chk.floorz = chk.dropoffz = sec.floorheight;
    chk.ceilingz = sec.ceilingheight;
    if (thing.flags & MF_NOCLIP) return chk;
    for (const other of world.mobjs) {
      if (other === thing || !other.alive) continue;
      if (Collision.thingBlocks(thing, other)) {
        chk.blocked = true;
        chk.hitThing = other;
        return chk;
      }
      if (thing.pickup !== null) break;
    }
    for (const ln of world.lines) {
      if (
        box[BOXRIGHT]! <= ln.bbox[BOXLEFT]! ||
        box[BOXLEFT]! >= ln.bbox[BOXRIGHT]! ||
        box[BOXTOP]! <= ln.bbox[BOXBOTTOM]! ||
        box[BOXBOTTOM]! >= ln.bbox[BOXTOP]!
      )
        continue;
      if (Collision.boxOnLineSide(box, ln) !== -1) continue;
      if (ln.backsector === null) {
        chk.blocked = true;
        return chk;
      }
      if ((thing.flags & MF_MISSILE) === 0) {
        if (ln.flags & ML_BLOCKING) {
          chk.blocked = true;
          return chk;
        }
        if (thing.player === null && ln.flags & ML_BLOCKMONSTERS) {
          chk.blocked = true;
          return chk;
        }
      }
      const [top, bottom, low] = Collision.lineOpening(ln);
      chk.ceilingz = Math.min(chk.ceilingz, top);
      chk.floorz = Math.max(chk.floorz, bottom);
      chk.dropoffz = Math.min(chk.dropoffz, low);
      if (ln.special) chk.spechit.push(ln);
    }
    return chk;
  }

  static tryMove(world: World, thing: Mobj, x: number, y: number, game: Game | null = null): boolean {
    const chk = Collision.checkPosition(world, thing, x, y);
    if (chk.blocked) return false;
    if ((thing.flags & MF_NOCLIP) === 0) {
      if (
        chk.ceilingz - chk.floorz < thing.height ||
        chk.ceilingz - thing.z < thing.height ||
        chk.floorz - thing.z > MAXSTEP
      )
        return false;
      if ((thing.flags & (MF_DROPOFF | MF_FLOAT)) === 0 && chk.floorz - chk.dropoffz > MAXSTEP)
        return false;
    }
    const oldx = thing.x;
    const oldy = thing.y;
    thing.floorz = chk.floorz;
    thing.ceilingz = chk.ceilingz;
    thing.x = x;
    thing.y = y;
    if (thing.pickup !== null && game !== null) game.touchSpecial(thing.pickup, thing);
    if (game !== null && (thing.flags & MF_NOCLIP) === 0) {
      for (const ln of chk.spechit) {
        const side = Collision.pointOnLineSide(thing.x, thing.y, ln);
        if (side !== Collision.pointOnLineSide(oldx, oldy, ln) && ln.special)
          game.crossSpecial(ln, Collision.pointOnLineSide(oldx, oldy, ln), thing);
      }
    }
    return true;
  }

  static slideMove(
    world: World,
    thing: Mobj,
    momx: number,
    momy: number,
    game: Game | null = null,
  ): void {
    momx = Math.max(-MAXMOVE, Math.min(MAXMOVE, momx));
    momy = Math.max(-MAXMOVE, Math.min(MAXMOVE, momy));
    if (Collision.tryMove(world, thing, thing.x + momx, thing.y + momy, game)) return;
    Collision.tryMove(world, thing, thing.x + momx, thing.y, game);
    Collision.tryMove(world, thing, thing.x, thing.y + momy, game);
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
    const hits: Array<[number, Line]> = [];
    for (const ln of world.lines) {
      const f = Collision.interceptFrac(x1, y1, x2, y2, ln);
      if (f !== null && f >= 0 && f <= FRACUNIT) hits.push([f, ln]);
    }
    hits.sort((a, b) => a[0] - b[0]);
    for (const [, ln] of hits) {
      if (!ln.special) {
        const op = Collision.lineOpening(ln);
        if (ln.backsector === null || op[0] - op[1] <= 0) {
          game.startSound("noway");
          return;
        }
        continue;
      }
      game.useSpecial(ln, mo, Collision.pointOnLineSide(mo.x, mo.y, ln));
      return;
    }
  }

  static lineAttack(
    world: World,
    source: Mobj,
    damage: number,
    game: Game | null,
    range: number,
  ): boolean {
    const x1 = source.x;
    const y1 = source.y;
    const x2 = x1 + shar(range, FRACBITS) * fineCos(source.angle);
    const y2 = y1 + shar(range, FRACBITS) * fineSin(source.angle);
    const hits: Array<[number, string, Line | Mobj]> = [];
    for (const ln of world.lines) {
      const f = Collision.interceptFrac(x1, y1, x2, y2, ln);
      if (f === null || f <= 0 || f > FRACUNIT) continue;
      // Harbour PTR_ShootTraverse: one-sided walls always stop the shot.
      // Two-sided lines (grates/bars) only stop it when the opening is closed.
      // ML_BLOCKING blocks walking, not hitscan — same as vanilla/Harbour.
      let solid = ln.backsector === null;
      if (!solid) {
        const [top, bottom] = Collision.lineOpening(ln);
        solid = top - bottom <= 32 * FRACUNIT;
      }
      if (solid) hits.push([f, "line", ln]);
    }
    for (const other of world.mobjs) {
      if (other === source || (other.flags & MF_SHOOTABLE) === 0) continue;
      const f = Collision.thingHitFrac(x1, y1, x2, y2, other);
      if (f !== null) hits.push([f, "thing", other]);
    }
    hits.sort((a, b) => a[0] - b[0]);
    for (const [, kind, obj] of hits) {
      if (kind === "thing") {
        if (game) game.damageMobj(obj as Mobj, source, damage);
        return true;
      }
      const ln = obj as Line;
      if (ln.special === 46 && game) game.useSpecial(ln, source, 0);
      return false;
    }
    return false;
  }

  private static thingHitFrac(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    mo: Mobj,
  ): number | null {
    const vx = x2 - x1;
    const vy = y2 - y1;
    const wx = mo.x - x1;
    const wy = mo.y - y1;
    const den = vx * vx + vy * vy;
    if (den <= 0.0) return null;
    const tn = wx * vx + wy * vy;
    if (tn < 0.0 || tn > den) return null;
    const px = Math.trunc(x1 + (tn * vx) / den);
    const py = Math.trunc(y1 + (tn * vy) / den);
    if (Collision.approxDistance(mo.x - px, mo.y - py) > mo.radius + 4 * FRACUNIT) return null;
    return Math.trunc((tn * FRACUNIT) / den);
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

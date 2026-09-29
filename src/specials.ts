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
import { intdiv } from "./compat.ts";
import {
  BUTTONTIME,
  CEILSPEED,
  FLOORSPEED,
  FRACUNIT,
  IT_BLUECARD,
  IT_BLUESKULL,
  IT_REDCARD,
  IT_REDSKULL,
  IT_YELLOWCARD,
  IT_YELLOWSKULL,
  MF_MISSILE,
  ML_TWOSIDED,
  PLAT_BLAZEDWUS,
  PLAT_DOWN,
  PLAT_DWUS,
  PLAT_UP,
  PLAT_WAITING,
  PLATSPEED,
  PLATWAIT,
  RESULT_CRUSHED,
  RESULT_OK,
  RESULT_PASTDEST,
  TICRATE,
  VDOORSPEED,
  VDOORWAIT,
  VLD_BLAZECLOSE,
  VLD_BLAZEOPEN,
  VLD_BLAZERAISE,
  VLD_CLOSE,
  VLD_CLOSE30,
  VLD_NORMAL,
  VLD_OPEN,
} from "./defs.ts";
import type { Mobj } from "./mobj.ts";
import type { Resources } from "./rdata.ts";
import type { Sound } from "./sound.ts";
import type { Line, Sector, World } from "./world.ts";

export class VerticalDoor {
  dead = false;
  constructor(
    public sector: Sector,
    public type: number,
    public direction: number,
    public topheight: number,
    public speed: number,
    public topwait: number,
    public topcountdown = 0,
  ) {}
}

export class Plat {
  dead = false;
  constructor(
    public sector: Sector,
    public type: number,
    public status: number,
    public speed: number,
    public low: number,
    public high: number,
    public wait: number,
    public count = 0,
  ) {}
}

export class FloorMove {
  dead = false;
  constructor(
    public sector: Sector,
    public direction: number,
    public dest: number,
    public speed: number,
  ) {}
}

export class CeilingMove {
  dead = false;
  constructor(
    public sector: Sector,
    public direction: number,
    public dest: number,
    public speed: number,
  ) {}
}

export class Button {
  constructor(
    public line: Line,
    public where: string,
    public texture: number,
    public timer: number,
  ) {}
}

type Thinker = VerticalDoor | Plat | FloorMove | CeilingMove;

export class Specials {
  thinkers: Thinker[] = [];
  buttons: Button[] = [];
  exitRequested = false;
  secretExit = false;
  switchMap: Record<number, number> = {};

  private static readonly SWITCH_PAIRS: Array<[string, string]> = [
    ["SW1BRCOM", "SW2BRCOM"], ["SW1BRN1", "SW2BRN1"], ["SW1BRN2", "SW2BRN2"], ["SW1BRNGN", "SW2BRNGN"], ["SW1BROWN", "SW2BROWN"],
    ["SW1COMM", "SW2COMM"], ["SW1COMP", "SW2COMP"], ["SW1DIRT", "SW2DIRT"], ["SW1EXIT", "SW2EXIT"], ["SW1GRAY", "SW2GRAY"],
    ["SW1GRAY1", "SW2GRAY1"], ["SW1METAL", "SW2METAL"], ["SW1PIPE", "SW2PIPE"], ["SW1SLAD", "SW2SLAD"], ["SW1STARG", "SW2STARG"],
    ["SW1STON1", "SW2STON1"], ["SW1STON2", "SW2STON2"], ["SW1STONE", "SW2STONE"], ["SW1STRTN", "SW2STRTN"], ["SW1BLUE", "SW2BLUE"],
    ["SW1CMT", "SW2CMT"], ["SW1GARG", "SW2GARG"], ["SW1GSTON", "SW2GSTON"], ["SW1HOT", "SW2HOT"], ["SW1LION", "SW2LION"],
    ["SW1SATYR", "SW2SATYR"], ["SW1SKIN", "SW2SKIN"], ["SW1VINE", "SW2VINE"], ["SW1WOOD", "SW2WOOD"], ["SW1PANEL", "SW2PANEL"],
    ["SW1ROCK", "SW2ROCK"], ["SW1MET2", "SW2MET2"], ["SW1WDMET", "SW2WDMET"], ["SW1BRIK", "SW2BRIK"], ["SW1MOD1", "SW2MOD1"],
    ["SW1ZIM", "SW2ZIM"], ["SW1STON6", "SW2STON6"], ["SW1TEK", "SW2TEK"], ["SW1MARB", "SW2MARB"], ["SW1SKULL", "SW2SKULL"],
  ];

  constructor(
    public world: World,
    public res: Resources,
    public sound: Sound,
  ) {
    for (const [a, b] of Specials.SWITCH_PAIRS) {
      const ia = res.textureNumForName(a);
      const ib = res.textureNumForName(b);
      if (ia || ib) {
        this.switchMap[ia] = ib;
        this.switchMap[ib] = ia;
      }
    }
  }

  private movePlane(s: Sector, speed: number, dest: number, plane: number, dir: number, crush = false): number {
    const prop: "ceilingheight" | "floorheight" = plane ? "ceilingheight" : "floorheight";
    const last = s[prop];
    let past = false;
    if (dir === -1) {
      if (last - speed < dest) {
        s[prop] = dest;
        past = true;
      } else {
        s[prop] -= speed;
      }
    } else if (last + speed > dest) {
      s[prop] = dest;
      past = true;
    } else {
      s[prop] += speed;
    }
    const nofit = Collision.changeSector(this.world, s, crush);
    if (nofit) {
      if (!crush || past) {
        s[prop] = last;
        Collision.changeSector(this.world, s, crush);
      }
      return past ? RESULT_PASTDEST : RESULT_CRUSHED;
    }
    return past ? RESULT_PASTDEST : RESULT_OK;
  }

  static surroundingSectors(s: Sector): Sector[] {
    const out: Sector[] = [];
    for (const ln of s.lines) {
      const o = ln.frontsector === s ? ln.backsector : ln.frontsector;
      if (o && o !== s && !out.includes(o)) out.push(o);
    }
    return out;
  }

  static lowestCeiling(s: Sector): number {
    let h = 0x7fffffff;
    for (const o of Specials.surroundingSectors(s)) h = Math.min(h, o.ceilingheight);
    return h === 0x7fffffff ? s.ceilingheight : h;
  }

  static lowestFloor(s: Sector): number {
    let h = s.floorheight;
    for (const o of Specials.surroundingSectors(s)) h = Math.min(h, o.floorheight);
    return h;
  }

  static highestFloor(s: Sector): number {
    let h = -500 * FRACUNIT;
    for (const o of Specials.surroundingSectors(s)) h = Math.max(h, o.floorheight);
    return h;
  }

  static nextHighestFloor(s: Sector, cur: number): number {
    let h = 0x7fffffff;
    for (const o of Specials.surroundingSectors(s)) if (o.floorheight > cur) h = Math.min(h, o.floorheight);
    return h === 0x7fffffff ? cur : h;
  }

  sectorsFromTag(tag: number): Sector[] {
    return tag ? this.world.sectors.filter((s) => s.tag === tag) : [];
  }

  tick(): void {
    const alive: Thinker[] = [];
    for (const t of this.thinkers) {
      if (t.dead) continue;
      if (t instanceof VerticalDoor) this.tickDoor(t);
      else if (t instanceof Plat) this.tickPlat(t);
      else if (t instanceof FloorMove) this.tickFloor(t);
      else if (t instanceof CeilingMove) this.tickCeiling(t);
      if (!t.dead) alive.push(t);
    }
    this.thinkers = alive;
    const remaining: Button[] = [];
    for (const b of this.buttons) {
      if (--b.timer <= 0) {
        const side = b.line.sides[0];
        if (side) {
          const prop = (b.where + "texture") as "toptexture" | "midtexture" | "bottomtexture";
          side[prop] = b.texture;
        }
      } else remaining.push(b);
    }
    this.buttons = remaining;
  }

  private tickDoor(d: VerticalDoor): void {
    if (d.direction === 0) {
      if (--d.topcountdown <= 0) {
        if ([VLD_NORMAL, VLD_BLAZERAISE].includes(d.type)) {
          d.direction = -1;
          this.sound.play(d.type === VLD_NORMAL ? "dorcls" : "bdcls");
        } else if (d.type === VLD_CLOSE30) {
          d.direction = 1;
          this.sound.play("doropn");
        }
      }
      return;
    }
    const dest = d.direction === 1 ? d.topheight : d.sector.floorheight;
    if (this.movePlane(d.sector, d.speed, dest, 1, d.direction) !== RESULT_PASTDEST) return;
    if (d.direction === 1) {
      if ([VLD_NORMAL, VLD_BLAZERAISE].includes(d.type)) {
        d.direction = 0;
        d.topcountdown = d.topwait;
      } else {
        d.sector.specialdata = null;
        d.dead = true;
      }
    } else if (d.type === VLD_CLOSE30) {
      d.direction = 0;
      d.topcountdown = TICRATE * 30;
    } else {
      d.sector.specialdata = null;
      d.dead = true;
    }
  }

  private tickPlat(p: Plat): void {
    if (p.status === PLAT_WAITING) {
      if (--p.count <= 0) {
        p.status = p.sector.floorheight <= p.low ? PLAT_UP : PLAT_DOWN;
        this.sound.play("pstart");
      }
      return;
    }
    const up = p.status === PLAT_UP;
    if (this.movePlane(p.sector, p.speed, up ? p.high : p.low, 0, up ? 1 : -1) !== RESULT_PASTDEST) return;
    if (!up) {
      p.status = PLAT_WAITING;
      p.count = p.wait;
      this.sound.play("pstop");
    } else {
      p.sector.specialdata = null;
      p.dead = true;
      this.sound.play("pstop");
    }
  }

  private tickFloor(f: FloorMove): void {
    if (this.movePlane(f.sector, f.speed, f.dest, 0, f.direction) === RESULT_PASTDEST) {
      f.sector.specialdata = null;
      f.dead = true;
    }
  }

  private tickCeiling(c: CeilingMove): void {
    if (this.movePlane(c.sector, c.speed, c.dest, 1, c.direction) === RESULT_PASTDEST) {
      c.sector.specialdata = null;
      c.dead = true;
    }
  }

  private spawnDoor(s: Sector, type: number, reverse = false): boolean {
    if (s.specialdata) {
      if (s.specialdata instanceof VerticalDoor && [VLD_NORMAL, VLD_BLAZERAISE].includes(type)) {
        s.specialdata.direction = s.specialdata.direction === -1 ? 1 : -1;
        return true;
      }
      return false;
    }
    const close = [VLD_CLOSE, VLD_BLAZECLOSE, VLD_CLOSE30].includes(type);
    const d = new VerticalDoor(
      s,
      type,
      reverse || close ? -1 : 1,
      Specials.lowestCeiling(s) - 4 * FRACUNIT,
      VDOORSPEED * (type >= VLD_BLAZERAISE ? 4 : 1),
      VDOORWAIT,
    );
    if (type === VLD_CLOSE30) d.topheight = s.ceilingheight;
    s.specialdata = d;
    this.thinkers.push(d);
    this.sound.play(
      d.direction === 1
        ? type < VLD_BLAZERAISE
          ? "doropn"
          : "bdopn"
        : type < VLD_BLAZERAISE
          ? "dorcls"
          : "bdcls",
    );
    return true;
  }

  doDoor(line: Line, type: number, reverse = false): boolean {
    let ok = false;
    for (const s of this.sectorsFromTag(line.tag)) if (this.spawnDoor(s, type, reverse)) ok = true;
    return ok;
  }

  verticalDoor(line: Line, thing: Mobj): void {
    const p = thing.player;
    const sp = line.special;
    const locks: Array<[number, number, number, number, string]> = [
      [26, 32, IT_BLUECARD, IT_BLUESKULL, "blue"],
      [27, 34, IT_YELLOWCARD, IT_YELLOWSKULL, "yellow"],
      [28, 33, IT_REDCARD, IT_REDSKULL, "red"],
    ];
    for (const [a, b, card, skull, name] of locks)
      if ([a, b].includes(sp) && p && !(p.cards[card] || p.cards[skull])) {
        p.message = `You need a ${name} key to open this door`;
        this.sound.play("oof");
        return;
      }
    const s = line.sides[1]?.sector;
    if (!s) return;
    let type: number;
    if ([1, 26, 27, 28].includes(sp)) type = VLD_NORMAL;
    else if ([31, 32, 33, 34].includes(sp)) {
      type = VLD_OPEN;
      line.special = 0;
    } else if (sp === 117) type = VLD_BLAZERAISE;
    else if (sp === 118) {
      type = VLD_OPEN;
      line.special = 0;
    } else type = VLD_NORMAL;
    this.spawnDoor(s, type);
  }

  doPlatDwus(line: Line, blaze = false): boolean {
    let ok = false;
    for (const s of this.sectorsFromTag(line.tag)) {
      if (s.specialdata) continue;
      const p = new Plat(
        s,
        blaze ? PLAT_BLAZEDWUS : PLAT_DWUS,
        PLAT_DOWN,
        PLATSPEED * (blaze ? 8 : 1),
        Specials.lowestFloor(s),
        s.floorheight,
        PLATWAIT * TICRATE,
      );
      if (p.low === p.high) p.low = p.high - 8 * FRACUNIT;
      s.specialdata = p;
      this.thinkers.push(p);
      this.sound.play("pstart");
      ok = true;
    }
    return ok;
  }

  doFloor(line: Line, dest: (s: Sector) => number, dir: number): boolean {
    let ok = false;
    for (const s of this.sectorsFromTag(line.tag)) {
      if (s.specialdata) continue;
      const f = new FloorMove(s, dir, dest(s), FLOORSPEED);
      s.specialdata = f;
      this.thinkers.push(f);
      ok = true;
    }
    return ok;
  }

  doCeiling(line: Line, dest: (s: Sector) => number, dir = -1, speed: number | null = null): boolean {
    let ok = false;
    for (const s of this.sectorsFromTag(line.tag)) {
      if (s.specialdata) continue;
      const c = new CeilingMove(s, dir, dest(s), speed ?? CEILSPEED);
      s.specialdata = c;
      this.thinkers.push(c);
      ok = true;
    }
    return ok;
  }

  doStairs(line: Line, step: number, speed: number): boolean {
    let ok = false;
    for (const s of this.sectorsFromTag(line.tag)) {
      if (s.specialdata) continue;
      let height = s.floorheight + step;
      let f = new FloorMove(s, 1, height, speed);
      s.specialdata = f;
      this.thinkers.push(f);
      ok = true;
      const texture = s.floorpic;
      let cur: Sector = s;
      while (true) {
        let next: Sector | null = null;
        for (const ln of cur.lines) {
          if (!(ln.flags & ML_TWOSIDED)) continue;
          const o = ln.frontsector === cur ? ln.backsector : ln.frontsector;
          if (o && o !== cur && o.floorpic === texture && !o.specialdata) {
            next = o;
            break;
          }
        }
        if (!next) break;
        height += step;
        f = new FloorMove(next, 1, height, speed);
        next.specialdata = f;
        this.thinkers.push(f);
        cur = next;
      }
    }
    return ok;
  }

  changeSwitch(line: Line, again: number): void {
    const side = line.sides[0];
    if (!side) return;
    if (!again) line.special = 0;
    const sound = line.special === 11 ? "swtchx" : "swtchn";
    for (const where of ["top", "mid", "bottom"] as const) {
      const prop = (where + "texture") as "toptexture" | "midtexture" | "bottomtexture";
      const tex = side[prop];
      if (this.switchMap[tex] !== undefined) {
        if (again) this.buttons.push(new Button(line, where, tex, BUTTONTIME));
        side[prop] = this.switchMap[tex]!;
        this.sound.play(sound);
        return;
      }
    }
    this.sound.play(sound);
  }

  useSpecial(line: Line, thing: Mobj, side: number): void {
    if (side !== 0) return;
    const sp = line.special;
    if ([1, 26, 27, 28, 31, 32, 33, 34, 117, 118].includes(sp)) {
      this.verticalDoor(line, thing);
      return;
    }
    if (sp === 11 || sp === 51) {
      this.changeSwitch(line, 0);
      this.exitRequested = true;
      if (sp === 51) this.secretExit = true;
      return;
    }
    const once: Record<number, () => boolean> = {
      29: () => this.doDoor(line, VLD_NORMAL),
      50: () => this.doDoor(line, VLD_CLOSE),
      103: () => this.doDoor(line, VLD_OPEN),
      111: () => this.doDoor(line, VLD_BLAZERAISE),
      112: () => this.doDoor(line, VLD_BLAZEOPEN),
      113: () => this.doDoor(line, VLD_BLAZECLOSE),
      21: () => this.doPlatDwus(line),
      122: () => this.doPlatDwus(line, true),
      18: () => this.doFloor(line, (s) => Specials.nextHighestFloor(s, s.floorheight), 1),
      23: () => this.doFloor(line, Specials.lowestFloor, -1),
      71: () => this.doFloor(line, Specials.highestFloor, -1),
      101: () => this.doFloor(line, (s) => Specials.nextHighestFloor(s, s.floorheight), 1),
      102: () => this.doFloor(line, (s) => s.floorheight - 8 * FRACUNIT, -1),
      7: () => this.doStairs(line, 8 * FRACUNIT, intdiv(FLOORSPEED, 4)),
      127: () => this.doStairs(line, 16 * FRACUNIT, FLOORSPEED * 4),
      41: () => this.doCeiling(line, (s) => s.floorheight),
      49: () => this.doCeiling(line, (s) => s.floorheight + 8 * FRACUNIT),
      14: () => this.doPlatDwus(line),
      15: () => this.doPlatDwus(line),
      20: () => this.doPlatDwus(line),
    };
    const repeat: Record<number, () => boolean> = {
      42: () => this.doDoor(line, VLD_CLOSE),
      61: () => this.doDoor(line, VLD_OPEN),
      63: () => this.doDoor(line, VLD_NORMAL),
      62: () => this.doPlatDwus(line),
      114: () => this.doDoor(line, VLD_BLAZERAISE),
      115: () => this.doDoor(line, VLD_BLAZEOPEN),
      116: () => this.doDoor(line, VLD_BLAZECLOSE),
      120: () => this.doPlatDwus(line, true),
      45: () => this.doFloor(line, (s) => s.floorheight - 8 * FRACUNIT, -1),
      60: () => this.doFloor(line, Specials.lowestFloor, -1),
      64: () => this.doFloor(line, (s) => Specials.nextHighestFloor(s, s.floorheight), 1),
      70: () => this.doFloor(line, Specials.highestFloor, -1),
      43: () => this.doCeiling(line, (s) => s.floorheight),
    };
    if (once[sp] !== undefined) {
      if (once[sp]!()) this.changeSwitch(line, 0);
    } else if (repeat[sp] !== undefined && repeat[sp]!()) this.changeSwitch(line, 1);
  }

  crossSpecial(line: Line, side: number, thing: Mobj): void {
    const sp = line.special;
    let clear = true;
    if (sp === 2) this.doDoor(line, VLD_OPEN);
    else if (sp === 3) this.doDoor(line, VLD_CLOSE);
    else if (sp === 4) this.doDoor(line, VLD_NORMAL);
    else if (sp === 5) this.doFloor(line, (s) => Specials.nextHighestFloor(s, s.floorheight), 1);
    else if (sp === 10) this.doPlatDwus(line);
    else if (sp === 16) this.doDoor(line, VLD_CLOSE30, true);
    else if (sp === 19) this.doFloor(line, (s) => s.floorheight - 8 * FRACUNIT, -1);
    else if (sp === 36) this.doFloor(line, Specials.highestFloor, -1);
    else if (sp === 38) this.doFloor(line, Specials.lowestFloor, -1);
    else if (sp === 39) {
      this.teleport(line, side, thing);
      clear = false;
    } else if (sp === 52) {
      this.exitRequested = true;
      clear = false;
    } else if (sp === 88) {
      this.doPlatDwus(line);
      clear = false;
    } else if (sp === 86) {
      this.doDoor(line, VLD_OPEN);
      clear = false;
    } else if (sp === 90) {
      this.doDoor(line, VLD_NORMAL);
      clear = false;
    } else if (sp === 105) {
      this.doDoor(line, VLD_BLAZERAISE);
      clear = false;
    } else if (sp === 106) {
      this.doDoor(line, VLD_BLAZEOPEN);
      clear = false;
    } else if (sp === 107) {
      this.doDoor(line, VLD_BLAZECLOSE);
      clear = false;
    } else if (sp === 120) {
      this.doPlatDwus(line, true);
      clear = false;
    } else if (sp === 121) this.doPlatDwus(line, true);
    else if (sp === 124) {
      this.exitRequested = this.secretExit = true;
      clear = false;
    } else clear = false;
    if (clear) line.special = 0;
  }

  private teleport(line: Line, side: number, thing: Mobj): void {
    if (side === 1 || (thing.flags & MF_MISSILE) !== 0) return;
    const tag = line.tag;
    for (let i = 0; i < this.world.sectors.length; i++) {
      const sector = this.world.sectors[i]!;
      if (sector.tag !== tag) continue;
      for (const dest of this.world.mobjs) {
        if (dest.type !== 14) continue;
        const destSector = Collision.pointInSubsector(this.world, dest.x, dest.y).sector!;
        if (destSector !== sector && destSector.iSector !== i) continue;
        thing.momx = thing.momy = thing.momz = 0;
        thing.x = dest.x;
        thing.y = dest.y;
        const ss = Collision.pointInSubsector(this.world, thing.x, thing.y);
        thing.floorz = ss.sector!.floorheight;
        thing.ceilingz = ss.sector!.ceilingheight;
        thing.z = thing.floorz;
        thing.angle = dest.angle;
        if (thing.player !== null) {
          thing.player.viewz = thing.z + thing.player.viewheight;
          thing.reactiontime = 18;
        }
        this.sound.play("telept");
        return;
      }
    }
  }
}

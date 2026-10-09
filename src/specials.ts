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
import { Enemy } from "./enemy.ts";
import { intdiv } from "./compat.ts";
import {
  BUTTONTIME,
  CEIL_CRUSHANDRAISE,
  CEIL_FASTCRUSH,
  CEIL_LOWERANDCRUSH,
  CEIL_LOWERTOFLOOR,
  CEIL_RAISETOHIGHEST,
  CEIL_SILENTCRUSH,
  CEILSPEED,
  FASTDARK,
  FLOORSPEED,
  FRACUNIT,
  GLOWSPEED,
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
  PLAT_PERPETUAL,
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
  VLD_RAISEIN5,
  SLOWDARK,
  STROBEBRIGHT,
} from "./defs.ts";
import { MT_TELEPORTMAN } from "./info.ts";
import type { Mobj } from "./mobj.ts";
import type { Resources } from "./rdata.ts";
import type { Sound } from "./sound.ts";
import { Line, type Sector, type World } from "./world.ts";

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
  crush = false;
  floorpic: number | null = null;
  constructor(
    public sector: Sector,
    public direction: number,
    public dest: number,
    public speed: number,
  ) {}
}

export class CeilingMove {
  dead = false;
  crush = false;
  ctype = 0;
  topheight = 0;
  bottomheight = 0;
  constructor(
    public sector: Sector,
    public direction: number,
    public dest: number,
    public speed: number,
  ) {}
}

export class LightThinker {
  dead = false;
  count = 0;
  minlight = 0;
  maxlight = 0;
  darktime = 0;
  brighttime = 0;
  maxtime = 64;
  mintime = 7;
  direction = -1;
  constructor(
    public sector: Sector,
    public kind: string,
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
  lights: LightThinker[] = [];
  scrollLines: Line[] = [];
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
    this.spawnSpecials();
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

  static highestCeiling(s: Sector): number {
    let h = s.ceilingheight;
    for (const o of Specials.surroundingSectors(s)) h = Math.max(h, o.ceilingheight);
    return h;
  }

  static raiseFloorDest(s: Sector): number {
    const dest = Specials.lowestCeiling(s);
    return dest <= s.ceilingheight ? dest : s.ceilingheight;
  }

  static raiseFloorCrushDest(s: Sector): number {
    return Specials.raiseFloorDest(s) - 8 * FRACUNIT;
  }

  static minSurroundingLight(s: Sector, max: number): number {
    for (const o of Specials.surroundingSectors(s)) max = Math.min(max, o.lightlevel);
    return max;
  }

  static maxSurroundingLight(s: Sector): number {
    let h = s.lightlevel;
    for (const o of Specials.surroundingSectors(s)) h = Math.max(h, o.lightlevel);
    return h;
  }

  sectorsFromTag(tag: number): Sector[] {
    return tag ? this.world.sectors.filter((s) => s.tag === tag) : [];
  }

  tick(): void {
    this.tickLights();
    for (const ln of this.scrollLines) {
      const side = ln.sides[0];
      if (side) side.textureoffset += FRACUNIT;
    }
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
        if ([VLD_NORMAL, VLD_BLAZERAISE, VLD_CLOSE].includes(d.type)) {
          d.direction = -1;
          this.sound.play(d.type === VLD_BLAZERAISE ? "bdcls" : "dorcls");
        } else if ([VLD_CLOSE30, VLD_RAISEIN5].includes(d.type)) {
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
    if (!up || p.type === PLAT_PERPETUAL) {
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
    if (this.movePlane(f.sector, f.speed, f.dest, 0, f.direction, f.crush) === RESULT_PASTDEST) {
      if (f.floorpic !== null) f.sector.floorpic = f.floorpic;
      f.sector.specialdata = null;
      f.dead = true;
    }
  }

  private tickCeiling(c: CeilingMove): void {
    const dest = c.ctype ? (c.direction === 1 ? c.topheight : c.bottomheight) : c.dest;
    const res = this.movePlane(c.sector, c.speed, dest, 1, c.direction, c.crush);
    const bounce = [CEIL_CRUSHANDRAISE, CEIL_FASTCRUSH, CEIL_SILENTCRUSH].includes(c.ctype);
    if (res === RESULT_PASTDEST) {
      if (bounce) {
        if (c.direction === -1) {
          c.direction = 1;
          c.speed = CEILSPEED * (c.ctype === CEIL_FASTCRUSH ? 2 : 1);
        } else c.direction = -1;
        if (c.ctype === CEIL_SILENTCRUSH) this.sound.play("pstop");
      } else {
        c.sector.specialdata = null;
        c.dead = true;
      }
    } else if (res === RESULT_CRUSHED && bounce) {
      c.speed = Math.max(1, intdiv(CEILSPEED, 8));
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

  private tagLine(tag: number): Line {
    const ln = new Line();
    ln.tag = tag;
    return ln;
  }

  doFloorTag(tag: number, dest: (s: Sector) => number, dir: number, speed = FLOORSPEED, crush = false): boolean {
    return this.doFloor(this.tagLine(tag), dest, dir, speed, crush);
  }

  doDoorTag(tag: number, type: number): boolean {
    return this.doDoor(this.tagLine(tag), type);
  }

  raiseToTextureTag(tag: number): boolean {
    return this.raiseToTexture(this.tagLine(tag));
  }

  raiseToTexture(line: Line): boolean {
    let ok = false;
    for (const s of this.sectorsFromTag(line.tag)) {
      if (s.specialdata) continue;
      let minsize = 0x7fffffff;
      for (const ln of s.lines) {
        if (!(ln.flags & ML_TWOSIDED)) continue;
        for (const side of ln.sides) {
          if (!side || side.bottomtexture <= 0) continue;
          const h = this.res.textureHeight(side.bottomtexture);
          if (h > 0 && h < minsize) minsize = h;
        }
      }
      if (minsize === 0x7fffffff) minsize = 64 * FRACUNIT;
      if (this.startFloor(s, s.floorheight + minsize, 1, FLOORSPEED)) ok = true;
    }
    return ok;
  }

  private lockedBlazeDoor(line: Line, thing: Mobj, sp: number): void {
    const p = thing.player;
    if (!p) return;
    let card: number;
    let skull: number;
    let name: string;
    if (sp === 99 || sp === 133) {
      card = IT_BLUECARD;
      skull = IT_BLUESKULL;
      name = "blue";
    } else if (sp === 134 || sp === 135) {
      card = IT_REDCARD;
      skull = IT_REDSKULL;
      name = "red";
    } else {
      card = IT_YELLOWCARD;
      skull = IT_YELLOWSKULL;
      name = "yellow";
    }
    if (!(p.cards[card] || p.cards[skull])) {
      p.message = `You need a ${name} key to open this door`;
      this.sound.play("oof");
      return;
    }
    if (this.doDoor(line, VLD_BLAZEOPEN)) {
      this.changeSwitch(line, sp === 99 || sp === 134 || sp === 136 ? 1 : 0);
    }
  }

  verticalDoor(line: Line, thing: Mobj): void {
    const p = thing.player;
    const sp = line.special;
    const locks: Array<[number[], number, number, string]> = [
      [[26, 32], IT_BLUECARD, IT_BLUESKULL, "blue"],
      [[27, 34], IT_YELLOWCARD, IT_YELLOWSKULL, "yellow"],
      [[28, 33], IT_REDCARD, IT_REDSKULL, "red"],
    ];
    for (const [nums, card, skull, name] of locks) {
      if (nums.includes(sp) && p && !(p.cards[card] || p.cards[skull])) {
        p.message = `You need a ${name} key to open this door`;
        this.sound.play("oof");
        return;
      }
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
      type = VLD_BLAZEOPEN;
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

  doFloor(line: Line, dest: (s: Sector) => number, dir: number, speed = FLOORSPEED, crush = false): boolean {
    let ok = false;
    for (const s of this.sectorsFromTag(line.tag)) {
      if (s.specialdata) continue;
      const f = new FloorMove(s, dir, dest(s), speed);
      f.crush = crush;
      s.specialdata = f;
      this.thinkers.push(f);
      ok = true;
    }
    return ok;
  }

  doCeiling(line: Line, dest: (s: Sector) => number, dir = -1, speed: number | null = null, crush = false): boolean {
    let ok = false;
    for (const s of this.sectorsFromTag(line.tag)) {
      if (s.specialdata) continue;
      const c = new CeilingMove(s, dir, dest(s), speed ?? CEILSPEED);
      c.crush = crush;
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

  spawnSpecials(): void {
    for (const s of this.world.sectors) {
      const sp = s.special;
      if (sp === 1) this.spawnLightFlash(s);
      else if (sp === 2) this.spawnStrobe(s, FASTDARK, false);
      else if (sp === 3) this.spawnStrobe(s, SLOWDARK, false);
      else if (sp === 4) {
        this.spawnStrobe(s, FASTDARK, false);
        s.special = 4;
      } else if (sp === 8) this.spawnGlow(s);
      else if (sp === 10) this.spawnDoorCloseIn30(s);
      else if (sp === 12) this.spawnStrobe(s, SLOWDARK, true);
      else if (sp === 13) this.spawnStrobe(s, FASTDARK, true);
      else if (sp === 14) this.spawnDoorRaiseIn5(s);
      else if (sp === 17) this.spawnFireFlicker(s);
    }
    for (const ln of this.world.lines) if (ln.special === 48) this.scrollLines.push(ln);
  }

  private pRandom(): number {
    return Enemy.random();
  }

  doCrusher(line: Line, ctype: number): boolean {
    let ok = false;
    for (const s of this.sectorsFromTag(line.tag)) {
      if (s.specialdata) continue;
      let top = s.ceilingheight;
      let bottom = s.floorheight;
      let crush = ctype !== CEIL_RAISETOHIGHEST;
      let speed = CEILSPEED * (ctype === CEIL_FASTCRUSH ? 2 : 1);
      let dir = -1;
      let dest = bottom;
      if (ctype === CEIL_RAISETOHIGHEST) {
        dest = Specials.highestCeiling(s);
        dir = 1;
        crush = false;
      } else if (ctype !== CEIL_LOWERTOFLOOR) {
        bottom += 8 * FRACUNIT;
        dest = bottom;
      }
      const c = new CeilingMove(s, dir, dest, speed);
      c.crush = crush;
      c.ctype = ctype;
      c.topheight = top;
      c.bottomheight = bottom;
      s.specialdata = c;
      this.thinkers.push(c);
      ok = true;
    }
    return ok;
  }

  doDonut(line: Line): boolean {
    let ok = false;
    for (const s1 of this.sectorsFromTag(line.tag)) {
      if (s1.specialdata || !s1.lines.length) continue;
      const edge = s1.lines[0]!;
      const s2 = edge.frontsector === s1 ? edge.backsector : edge.frontsector;
      if (!s2) continue;
      let s3: Sector | null = null;
      for (const ln of s2.lines) {
        if (ln.backsector && ln.backsector !== s1) {
          s3 = ln.backsector;
          break;
        }
      }
      if (!s3) continue;
      if (this.startFloor(s2, s3.floorheight, 1, intdiv(FLOORSPEED, 2), false, s3.floorpic)) ok = true;
      if (this.startFloor(s1, s3.floorheight, -1, intdiv(FLOORSPEED, 2))) ok = true;
    }
    return ok;
  }

  private startFloor(s: Sector, dest: number, dir: number, speed: number, crush = false, pic: number | null = null): boolean {
    if (s.specialdata) return false;
    const f = new FloorMove(s, dir, dest, speed);
    f.crush = crush;
    f.floorpic = pic;
    s.specialdata = f;
    this.thinkers.push(f);
    return true;
  }

  doPlatPerpetual(line: Line): boolean {
    let ok = false;
    for (const s of this.sectorsFromTag(line.tag)) {
      if (s.specialdata) continue;
      const p = new Plat(
        s, PLAT_PERPETUAL, this.pRandom() & 1, PLATSPEED,
        Math.min(Specials.lowestFloor(s), s.floorheight),
        Math.max(Specials.highestFloor(s), s.floorheight),
        PLATWAIT * TICRATE,
      );
      s.specialdata = p;
      this.thinkers.push(p);
      this.sound.play("pstart");
      ok = true;
    }
    return ok;
  }

  doPlatRaise(line: Line, amount = 0): boolean {
    let ok = false;
    const pic = line.sides[0]?.sector?.floorpic ?? null;
    for (const s of this.sectorsFromTag(line.tag)) {
      if (s.specialdata) continue;
      const high = amount ? s.floorheight + amount : Specials.nextHighestFloor(s, s.floorheight);
      if (pic !== null) s.floorpic = pic;
      const p = new Plat(s, PLAT_DWUS, PLAT_UP, intdiv(PLATSPEED, 2), s.floorheight, high, 0);
      s.specialdata = p;
      this.thinkers.push(p);
      this.sound.play("pstart");
      ok = true;
    }
    return ok;
  }

  lightTurnOn(line: Line, bright: number): boolean {
    let ok = false;
    for (const s of this.sectorsFromTag(line.tag)) {
      s.lightlevel = bright || Specials.maxSurroundingLight(s);
      ok = true;
    }
    return ok;
  }

  turnTagLightsOff(line: Line): boolean {
    let ok = false;
    for (const s of this.sectorsFromTag(line.tag)) {
      s.lightlevel = Specials.minSurroundingLight(s, s.lightlevel);
      ok = true;
    }
    return ok;
  }

  startLightStrobing(line: Line): boolean {
    let ok = false;
    for (const s of this.sectorsFromTag(line.tag)) {
      if (s.specialdata) continue;
      this.spawnStrobe(s, SLOWDARK, false);
      ok = true;
    }
    return ok;
  }

  private spawnLightFlash(s: Sector): void {
    s.special = 0;
    const l = new LightThinker(s, "flash");
    l.maxlight = s.lightlevel;
    l.minlight = Specials.minSurroundingLight(s, s.lightlevel);
    l.count = (this.pRandom() & l.maxtime) + 1;
    this.lights.push(l);
  }

  private spawnStrobe(s: Sector, dark: number, sync: boolean): void {
    s.special = 0;
    const min = Specials.minSurroundingLight(s, s.lightlevel);
    const l = new LightThinker(s, "strobe");
    l.maxlight = s.lightlevel;
    l.minlight = min === s.lightlevel ? 0 : min;
    l.darktime = dark;
    l.brighttime = STROBEBRIGHT;
    l.count = sync ? 1 : (this.pRandom() & 7) + 1;
    this.lights.push(l);
  }

  private spawnGlow(s: Sector): void {
    s.special = 0;
    const l = new LightThinker(s, "glow");
    l.maxlight = s.lightlevel;
    l.minlight = Specials.minSurroundingLight(s, s.lightlevel);
    this.lights.push(l);
  }

  private spawnFireFlicker(s: Sector): void {
    s.special = 0;
    const l = new LightThinker(s, "fire");
    l.maxlight = s.lightlevel;
    l.minlight = Specials.minSurroundingLight(s, s.lightlevel) + 16;
    l.count = 4;
    this.lights.push(l);
  }

  private spawnDoorCloseIn30(s: Sector): void {
    if (s.specialdata) return;
    s.special = 0;
    const d = new VerticalDoor(s, VLD_CLOSE, 0, s.ceilingheight, VDOORSPEED, VDOORWAIT);
    d.topcountdown = 30 * TICRATE;
    s.specialdata = d;
    this.thinkers.push(d);
  }

  private spawnDoorRaiseIn5(s: Sector): void {
    if (s.specialdata) return;
    s.special = 0;
    const d = new VerticalDoor(s, VLD_RAISEIN5, 0, Specials.lowestCeiling(s) - 4 * FRACUNIT, VDOORSPEED, VDOORWAIT);
    d.topcountdown = 5 * 60 * TICRATE;
    s.specialdata = d;
    this.thinkers.push(d);
  }

  private tickLights(): void {
    for (const l of this.lights) {
      if (l.kind === "glow") {
        if (l.direction === -1) {
          l.sector.lightlevel -= GLOWSPEED;
          if (l.sector.lightlevel <= l.minlight) {
            l.sector.lightlevel += GLOWSPEED;
            l.direction = 1;
          }
        } else {
          l.sector.lightlevel += GLOWSPEED;
          if (l.sector.lightlevel >= l.maxlight) {
            l.sector.lightlevel -= GLOWSPEED;
            l.direction = -1;
          }
        }
        continue;
      }
      if (--l.count !== 0) continue;
      if (l.kind === "flash") {
        if (l.sector.lightlevel === l.maxlight) {
          l.sector.lightlevel = l.minlight;
          l.count = (this.pRandom() & l.mintime) + 1;
        } else {
          l.sector.lightlevel = l.maxlight;
          l.count = (this.pRandom() & l.maxtime) + 1;
        }
      } else if (l.kind === "strobe") {
        if (l.sector.lightlevel === l.minlight) {
          l.sector.lightlevel = l.maxlight;
          l.count = l.brighttime;
        } else {
          l.sector.lightlevel = l.minlight;
          l.count = l.darktime;
        }
      } else if (l.kind === "fire") {
        const amount = (this.pRandom() & 3) * 16;
        l.sector.lightlevel = l.sector.lightlevel - amount < l.minlight ? l.minlight : l.maxlight - amount;
        l.count = 4;
      }
    }
  }

  shootSpecial(line: Line, _thing: Mobj): void {
    const sp = line.special;
    if (sp === 24 && this.doFloor(line, Specials.raiseFloorDest, 1)) this.changeSwitch(line, 0);
    else if (sp === 46) {
      this.doDoor(line, VLD_OPEN);
      this.changeSwitch(line, 1);
    } else if (sp === 47 && this.doPlatRaise(line, 0)) this.changeSwitch(line, 0);
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
    if ([99, 133, 134, 135, 136, 137].includes(sp)) {
      this.lockedBlazeDoor(line, thing, sp);
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
      102: () => this.doFloor(line, Specials.highestFloor, -1),
      7: () => this.doStairs(line, 8 * FRACUNIT, intdiv(FLOORSPEED, 4)),
      127: () => this.doStairs(line, 16 * FRACUNIT, FLOORSPEED * 4),
      41: () => this.doCrusher(line, CEIL_LOWERTOFLOOR),
      49: () => this.doCrusher(line, CEIL_CRUSHANDRAISE),
      9: () => this.doDonut(line),
      14: () => this.doPlatRaise(line, 32 * FRACUNIT),
      15: () => this.doPlatRaise(line, 24 * FRACUNIT),
      20: () => this.doPlatRaise(line, 0),
      55: () => this.doFloor(line, Specials.raiseFloorCrushDest, 1, FLOORSPEED, true),
      101: () => this.doFloor(line, Specials.raiseFloorDest, 1),
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
      45: () => this.doFloor(line, Specials.highestFloor, -1),
      60: () => this.doFloor(line, Specials.lowestFloor, -1),
      64: () => this.doFloor(line, (s) => Specials.nextHighestFloor(s, s.floorheight), 1),
      70: () => this.doFloor(line, Specials.highestFloor, -1),
      43: () => this.doCrusher(line, CEIL_LOWERTOFLOOR),
      138: () => this.lightTurnOn(line, 255),
      139: () => this.lightTurnOn(line, 35),
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
    else if (sp === 5) this.doFloor(line, Specials.raiseFloorDest, 1);
    else if (sp === 6) this.doCrusher(line, CEIL_FASTCRUSH);
    else if (sp === 8) this.doStairs(line, 8 * FRACUNIT, intdiv(FLOORSPEED, 4));
    else if (sp === 10) this.doPlatDwus(line);
    else if (sp === 12) this.lightTurnOn(line, 0);
    else if (sp === 13) this.lightTurnOn(line, 255);
    else if (sp === 16) this.doDoor(line, VLD_CLOSE30, true);
    else if (sp === 17) this.startLightStrobing(line);
    else if (sp === 19) this.doFloor(line, Specials.highestFloor, -1);
    else if (sp === 22) this.doPlatRaise(line, 0);
    else if (sp === 25) this.doCrusher(line, CEIL_CRUSHANDRAISE);
    else if (sp === 38) this.doFloor(line, Specials.lowestFloor, -1);
    else if (sp === 39) this.teleport(line, side, thing);
    else if (sp === 44) this.doCrusher(line, CEIL_LOWERANDCRUSH);
    else if (sp === 52) {
      this.exitRequested = true;
      clear = false;
    } else if (sp === 53) this.doPlatPerpetual(line);
    else if (sp === 56) this.doFloor(line, Specials.raiseFloorCrushDest, 1, FLOORSPEED, true);
    else if (sp === 58) this.doFloor(line, (s) => s.floorheight + 24 * FRACUNIT, 1);
    else if (sp === 79) {
      this.lightTurnOn(line, 35);
      clear = false;
    } else if (sp === 80) {
      this.lightTurnOn(line, 0);
      clear = false;
    } else if (sp === 81) {
      this.lightTurnOn(line, 255);
      clear = false;
    } else if (sp === 86) {
      this.doDoor(line, VLD_OPEN);
      clear = false;
    } else if (sp === 87) {
      this.doPlatPerpetual(line);
      clear = false;
    } else if (sp === 88) {
      this.doPlatDwus(line);
      clear = false;
    } else if (sp === 90) {
      this.doDoor(line, VLD_NORMAL);
      clear = false;
    } else if (sp === 91) {
      this.doFloor(line, (s) => Specials.nextHighestFloor(s, s.floorheight), 1);
      clear = false;
    } else if (sp === 92) {
      this.doFloor(line, (s) => s.floorheight + 24 * FRACUNIT, 1);
      clear = false;
    } else if (sp === 94) {
      this.doFloor(line, (s) => Specials.nextHighestFloor(s, s.floorheight), 1, FLOORSPEED, true);
      clear = false;
    } else if (sp === 97) {
      this.teleport(line, side, thing);
      clear = false;
    } else if (sp === 98) {
      this.doFloor(line, Specials.highestFloor, -1, FLOORSPEED * 4);
      clear = false;
    } else if (sp === 100) this.doStairs(line, 16 * FRACUNIT, FLOORSPEED * 4);
    else if (sp === 104) this.turnTagLightsOff(line);
    else if (sp === 105) {
      this.doDoor(line, VLD_BLAZERAISE);
      clear = false;
    } else if (sp === 106) {
      this.doDoor(line, VLD_BLAZEOPEN);
      clear = false;
    } else if (sp === 107) {
      this.doDoor(line, VLD_BLAZECLOSE);
      clear = false;
    } else if (sp === 108) this.doDoor(line, VLD_BLAZERAISE);
    else if (sp === 109) this.doDoor(line, VLD_BLAZEOPEN);
    else if (sp === 110) this.doDoor(line, VLD_BLAZECLOSE);
    else if (sp === 119) this.doFloor(line, (s) => Specials.nextHighestFloor(s, s.floorheight), 1);
    else if (sp === 120) {
      this.doPlatDwus(line, true);
      clear = false;
    } else if (sp === 121) this.doPlatDwus(line, true);
    else if (sp === 124) {
      this.exitRequested = this.secretExit = true;
      clear = false;
    } else if (sp === 125) {
      if (thing.player === null) this.teleport(line, side, thing);
    } else if (sp === 126) {
      if (thing.player === null) this.teleport(line, side, thing);
      clear = false;
    } else if (sp === 128) {
      this.doFloor(line, (s) => Specials.nextHighestFloor(s, s.floorheight), 1);
      clear = false;
    } else if (sp === 129) {
      this.doFloor(line, (s) => Specials.nextHighestFloor(s, s.floorheight), 1, FLOORSPEED * 4);
      clear = false;
    }     else if (sp === 130) this.doFloor(line, (s) => Specials.nextHighestFloor(s, s.floorheight), 1, FLOORSPEED * 4);
    else if (sp === 141) this.doCrusher(line, CEIL_SILENTCRUSH);
    else clear = false;
    if (clear) line.special = 0;
  }

  private teleport(line: Line, side: number, thing: Mobj): void {
    if (side === 1 || (thing.flags & MF_MISSILE) !== 0) return;
    const tag = line.tag;
    for (let i = 0; i < this.world.sectors.length; i++) {
      const sector = this.world.sectors[i]!;
      if (sector.tag !== tag) continue;
      for (const dest of this.world.mobjs) {
        if (dest.type !== MT_TELEPORTMAN) continue;
        const destSector = Collision.pointInSubsector(this.world, dest.x, dest.y).sector!;
        if (destSector !== sector && destSector.iSector !== i) continue;
        thing.momx = thing.momy = thing.momz = 0;
        Collision.unsetThingPosition(this.world, thing);
        thing.x = dest.x;
        thing.y = dest.y;
        const ss = Collision.pointInSubsector(this.world, thing.x, thing.y);
        thing.floorz = ss.sector!.floorheight;
        thing.ceilingz = ss.sector!.ceilingheight;
        thing.z = thing.floorz;
        thing.angle = dest.angle;
        Collision.setThingPosition(this.world, thing);
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

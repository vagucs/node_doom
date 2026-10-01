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

import {
  absFixed,
  asI32,
  asU32,
  fixedDiv,
  fixedMul,
  intdiv,
  shar,
  ushr,
} from "./compat.ts";
import {
  ANG90,
  ANG180,
  ANGLETOFINESHIFT,
  DBITS,
  FIELDOFVIEW,
  FINEANGLES,
  FINEMASK,
  FRACBITS,
  FRACUNIT,
  LIGHTLEVELS,
  LIGHTSCALESHIFT,
  LIGHTZSHIFT,
  MAXLIGHTSCALE,
  MAXLIGHTZ,
  ML_DONTPEGBOTTOM,
  ML_DONTPEGTOP,
  ML_MAPPED,
  NF_SUBSECTOR,
  NUMCOLORMAPS,
  SBARHEIGHT,
  SCREENHEIGHT,
  SCREENWIDTH,
  SIL_BOTH,
  SIL_BOTTOM,
  SIL_NONE,
  SIL_TOP,
} from "./defs.ts";
import type { Resources } from "./rdata.ts";
import { fineCos, fineSin, finesine, finetangent, slopeDiv, tantoangle } from "./tables.ts";
import type { World } from "./world.ts";

export class RenderClipRange {
  constructor(
    public first = 0,
    public last = 0,
  ) {}
}

export class Visplane {
  top: number[] = [];
  bottom: number[] = [];
  constructor(
    public height = 0,
    public picnum = 0,
    public lightlevel = 0,
    public minx = 0,
    public maxx = 0,
  ) {}
}

export class DrawSeg {
  x1 = 0;
  x2 = 0;
  scale1 = 0;
  scale2 = 0;
  silhouette = 0;
  sprtopclip: number[] = [];
  sprbottomclip: number[] = [];
  bsilheight = 0;
  tsilheight = 0;
  curline: any = null;
  scalestep = 0;
  maskedtexturecol: number[] | null = null;
}

export class Renderer {
  private static readonly HEIGHTBITS = 12;
  private static readonly HEIGHTUNIT = 1 << 12;
  private static readonly ANGLETOSKYSHIFT = 22;
  private static readonly SHRT_MAX = 0x7fff;
  private static readonly INT_MAX = 0x7fffffff;
  private static readonly INT_MIN = -0x7fffffff;

  res: Resources;
  viewwidth = 0;
  viewheight = 0;
  centerx = 0;
  centery = 0;
  centerxfrac = 0;
  centeryfrac = 0;
  projection = 0;
  detailshift = 0;
  viewangletox: number[] = [];
  xtoviewangle: number[] = [];
  clipangle = 0;
  yslope: number[] = [];
  distscale: number[] = [];
  scalelight: number[][] = [];
  zlight: number[][] = [];
  walllights: number[] = [];
  ylookup: number[] = [];
  columnofs: number[] = [];
  viewwindowx = 0;
  viewwindowy = 0;
  scaledviewwidth = 0;
  screenblocks = 10;
  pspritescale = 0;
  pspriteiscale = 0;
  ceilingclip: number[] = [];
  floorclip: number[] = [];
  private solidsegs: RenderClipRange[] = [];
  private newend = 0;
  private visplanes: Visplane[] = [];
  private floorplane: Visplane | null = null;
  private ceilingplane: Visplane | null = null;
  viewx = 0;
  viewy = 0;
  viewz = 0;
  viewangle = 0;
  viewcos = 0;
  viewsin = 0;
  extralight = 0;
  fixedcolormap: Buffer | null = null;
  private curline: any = null;
  private frontsector: any = null;
  private backsector: any = null;
  private rw_x = 0;
  private rw_stopx = 0;
  private rw_start = 0;
  private rw_centerangle = 0;
  private rw_offset = 0;
  private rw_distance = 0;
  private rw_scale = 0;
  private rw_scalestep = 0;
  private rw_midtexturemid = 0;
  private rw_toptexturemid = 0;
  private rw_bottomtexturemid = 0;
  private rw_normalangle = 0;
  private rw_angle1 = 0;
  private segtextured = false;
  private markfloor = false;
  private markceiling = false;
  private maskedtexture = false;
  private maskedtexturecol: number[] | null = null;
  private midtexture = 0;
  private toptexture = 0;
  private bottomtexture = 0;
  private pixhigh = 0;
  private pixlow = 0;
  private pixhighstep = 0;
  private pixlowstep = 0;
  private topfrac = 0;
  private topstep = 0;
  private bottomfrac = 0;
  private bottomstep = 0;
  private worldtop = 0;
  private worldbottom = 0;
  private worldhigh = 0;
  private worldlow = 0;
  dc_x = 0;
  dc_yl = 0;
  dc_yh = 0;
  dc_iscale = 0;
  dc_texturemid = 0;
  dc_source: Buffer;
  dc_colormap: Buffer;
  fb: Uint8Array = new Uint8Array(SCREENWIDTH * SCREENHEIGHT);
  drawsegs: DrawSeg[] = [];
  private basexscale = 0;
  private baseyscale = 0;

  constructor(resources: Resources) {
    this.res = resources;
    this.viewwidth = SCREENWIDTH;
    this.viewheight = SCREENHEIGHT - SBARHEIGHT;
    this.centerx = intdiv(this.viewwidth, 2);
    this.centery = intdiv(this.viewheight, 2);
    this.centerxfrac = this.centerx << FRACBITS;
    this.centeryfrac = this.centery << FRACBITS;
    this.projection = this.centerxfrac;
    this.viewangletox = new Array(intdiv(FINEANGLES, 2)).fill(0);
    this.xtoviewangle = new Array(SCREENWIDTH + 1).fill(0);
    this.yslope = new Array(SCREENHEIGHT).fill(0);
    this.distscale = new Array(SCREENWIDTH).fill(0);
    for (let i = 0; i < LIGHTLEVELS; ++i) {
      this.scalelight[i] = new Array(MAXLIGHTSCALE).fill(0);
      this.zlight[i] = new Array(MAXLIGHTZ).fill(0);
    }
    this.walllights = new Array(MAXLIGHTSCALE).fill(0);
    for (let i = 0; i < SCREENHEIGHT; ++i) this.ylookup[i] = i * SCREENWIDTH;
    this.columnofs = [];
    for (let i = 0; i < SCREENWIDTH; ++i) this.columnofs[i] = i;
    this.scaledviewwidth = SCREENWIDTH;
    this.pspritescale = FRACUNIT;
    this.pspriteiscale = FRACUNIT;
    this.ceilingclip = new Array(SCREENWIDTH).fill(0);
    this.floorclip = new Array(SCREENWIDTH).fill(0);
    for (let i = 0; i < 64; ++i) this.solidsegs.push(new RenderClipRange());
    this.dc_source = Buffer.alloc(128);
    this.dc_colormap = Buffer.from(Array.from({ length: 256 }, (_, i) => i));
    this.fb = new Uint8Array(SCREENWIDTH * SCREENHEIGHT);
    this.initMapping();
    this.initLights();
    this.initSlopes();
  }

  setViewSize(blocks: number, detail: number): void {
    blocks = Math.max(3, Math.min(11, blocks));
    this.detailshift = detail !== 0 ? 1 : 0;
    this.screenblocks = blocks;
    let scaled: number;
    let viewheight: number;
    if (blocks === 11) {
      scaled = SCREENWIDTH;
      viewheight = SCREENHEIGHT;
    } else {
      scaled = blocks * 32;
      viewheight = intdiv(blocks * 168, 10) & ~7;
    }
    this.scaledviewwidth = scaled;
    this.viewwidth = scaled >> this.detailshift;
    this.viewheight = viewheight;
    this.centerx = intdiv(this.viewwidth, 2);
    this.centery = intdiv(this.viewheight, 2);
    this.centerxfrac = this.centerx << FRACBITS;
    this.centeryfrac = this.centery << FRACBITS;
    this.projection = this.centerxfrac;
    this.viewwindowx = (SCREENWIDTH - scaled) >> 1;
    this.viewwindowy = scaled === SCREENWIDTH ? 0 : (SCREENHEIGHT - SBARHEIGHT - viewheight) >> 1;
    this.ylookup = [];
    for (let i = 0; i < SCREENHEIGHT; ++i) this.ylookup[i] = (i + this.viewwindowy) * SCREENWIDTH;
    this.columnofs = [];
    for (let i = 0; i < SCREENWIDTH; ++i) this.columnofs[i] = this.viewwindowx + i;
    this.ceilingclip = new Array(Math.max(1, this.viewwidth)).fill(0);
    this.floorclip = new Array(Math.max(1, this.viewwidth)).fill(0);
    this.pspritescale = intdiv(FRACUNIT * this.viewwidth, SCREENWIDTH);
    this.pspriteiscale = intdiv(FRACUNIT * SCREENWIDTH, Math.max(1, this.viewwidth));
    this.initMapping();
    this.initSlopes();
    this.initLights();
  }

  private initMapping(): void {
    const half = intdiv(FINEANGLES, 2);
    const focal = fixedDiv(
      this.centerxfrac,
      finetangent[intdiv(FINEANGLES, 4) + intdiv(FIELDOFVIEW, 2)]!,
    );
    for (let i = 0; i < half; ++i) {
      const ft = finetangent[i]!;
      let t: number;
      if (ft > FRACUNIT * 2) {
        t = -1;
      } else if (ft < -FRACUNIT * 2) {
        t = this.viewwidth + 1;
      } else {
        t = asI32(this.centerxfrac - fixedMul(ft, focal) + FRACUNIT - 1) >> FRACBITS;
        t = Math.max(-1, Math.min(this.viewwidth + 1, t));
      }
      this.viewangletox[i] = t;
    }
    for (let x = 0; x <= this.viewwidth; ++x) {
      let i = 0;
      while (i < half && this.viewangletox[i]! > x) ++i;
      this.xtoviewangle[x] = asU32((i << ANGLETOFINESHIFT) - ANG90);
    }
    for (let i = 0; i < half; ++i) {
      if (this.viewangletox[i] === -1) this.viewangletox[i] = 0;
      else if (this.viewangletox[i] === this.viewwidth + 1) this.viewangletox[i] = this.viewwidth;
    }
    this.clipangle = this.xtoviewangle[0]!;
  }

  private initLights(): void {
    for (let i = 0; i < LIGHTLEVELS; ++i) {
      const startmap = intdiv((LIGHTLEVELS - 1 - i) * 2 * NUMCOLORMAPS, LIGHTLEVELS);
      for (let j = 0; j < MAXLIGHTZ; ++j) {
        const scale =
          fixedDiv(intdiv(SCREENWIDTH, 2) * FRACUNIT, (j + 1) << LIGHTZSHIFT) >> LIGHTSCALESHIFT;
        this.zlight[i]![j] = Math.max(0, Math.min(NUMCOLORMAPS - 1, startmap - intdiv(scale, 2)));
      }
      const vw = Math.max(1, this.viewwidth << this.detailshift);
      for (let j = 0; j < MAXLIGHTSCALE; ++j) {
        const level = startmap - Math.trunc((j * SCREENWIDTH) / vw / 2);
        this.scalelight[i]![j] = Math.max(0, Math.min(NUMCOLORMAPS - 1, level));
      }
    }
  }

  private initSlopes(): void {
    for (let i = 0; i < this.viewheight; ++i) {
      const dy = Math.abs(((i - this.centery) << FRACBITS) + intdiv(FRACUNIT, 2));
      this.yslope[i] = fixedDiv(intdiv(this.viewwidth << this.detailshift, 2) * FRACUNIT, Math.max(1, dy));
    }
    for (let i = 0; i < this.viewwidth; ++i) {
      const cosadj = absFixed(fineCos(this.xtoviewangle[i]!));
      this.distscale[i] = fixedDiv(FRACUNIT, Math.max(1, cosadj));
    }
  }

  pointToAngle(x: number, y: number): number {
    x = asI32(x - this.viewx);
    y = asI32(y - this.viewy);
    if (x === 0 && y === 0) return 0;
    if (x >= 0) {
      if (y >= 0) {
        return x > y
          ? tantoangle[slopeDiv(y, x)]!
          : asU32(ANG90 - 1 - tantoangle[slopeDiv(x, y)]!);
      }
      y = -y;
      return x > y
        ? asU32(-tantoangle[slopeDiv(y, x)]!)
        : asU32(0xc0000000 + tantoangle[slopeDiv(x, y)]!);
    }
    x = -x;
    if (y >= 0) {
      return x > y
        ? asU32(ANG180 - 1 - tantoangle[slopeDiv(y, x)]!)
        : asU32(ANG90 + tantoangle[slopeDiv(x, y)]!);
    }
    y = -y;
    return x > y
      ? asU32(ANG180 + tantoangle[slopeDiv(y, x)]!)
      : asU32(0xc0000000 - 1 - tantoangle[slopeDiv(x, y)]!);
  }

  pointOnSide(x: number, y: number, node: any): number {
    const dx = asI32(x - node.x);
    const dy = asI32(y - node.y);
    const left = asI32(node.dy >> 16) * dx;
    const right = dy * asI32(node.dx >> 16);
    return right >= left ? 1 : 0;
  }

  scaleFromGlobalAngle(visangle: number): number {
    const anglea = asU32(ANG90 + asU32(visangle - this.viewangle));
    const angleb = asU32(ANG90 + asU32(visangle - this.rw_normalangle));
    const sinea = finesine[(anglea >>> ANGLETOFINESHIFT) & FINEMASK]!;
    const sineb = finesine[(angleb >>> ANGLETOFINESHIFT) & FINEMASK]!;
    const num = fixedMul(this.projection, sineb) << this.detailshift;
    const den = fixedMul(this.rw_distance, sinea);
    if (den !== 0 && den > num >> 16) {
      return Math.max(256, Math.min(64 * FRACUNIT, fixedDiv(num, den)));
    }
    return 64 * FRACUNIT;
  }

  setupFrame(x: number, y: number, z: number, angle: number, extraLight = 0, fixedcolormap = 0): void {
    this.viewx = x;
    this.viewy = y;
    this.viewz = z;
    this.viewangle = asU32(angle);
    this.viewsin = fineSin(this.viewangle);
    this.viewcos = fineCos(this.viewangle);
    this.extralight = extraLight;
    this.fixedcolormap = fixedcolormap ? this.res.colormap(fixedcolormap) : null;
    const ang = ushr(asU32(this.viewangle - ANG90), ANGLETOFINESHIFT) & FINEMASK;
    this.basexscale = fixedDiv(finesine[(ang + intdiv(FINEANGLES, 4)) & FINEMASK]!, this.centerxfrac || 1);
    this.baseyscale = -fixedDiv(finesine[ang]!, this.centerxfrac || 1);
  }

  render(world: World, fb: Uint8Array): void {
    this.fb = fb;
    this.visplanes = [];
    this.drawsegs = [];
    this.clearClip();
    if (world.nodes && world.nodes.length > 0) {
      this.renderBspNode(world, world.numnodes - 1);
    } else {
      this.subsector(world, 0);
    }
    this.drawPlanes();
  }

  private clearClip(): void {
    this.solidsegs[0]!.first = -0x7fffffff;
    this.solidsegs[0]!.last = -1;
    this.solidsegs[1]!.first = this.viewwidth;
    this.solidsegs[1]!.last = 0x7fffffff;
    this.newend = 2;
    for (let i = 0; i < this.viewwidth; ++i) {
      this.floorclip[i] = this.viewheight;
      this.ceilingclip[i] = -1;
    }
  }

  private findPlane(height: number, picnum: number, lightlevel: number): Visplane {
    if (picnum === this.res.skyflatnum) {
      height = 0;
      lightlevel = 0;
    }
    for (const plane of this.visplanes) {
      if (plane.height === height && plane.picnum === picnum && plane.lightlevel === lightlevel) {
        return plane;
      }
    }
    const plane = new Visplane(height, picnum, lightlevel, this.viewwidth, -1);
    plane.top = new Array(SCREENWIDTH).fill(0xff);
    plane.bottom = new Array(SCREENWIDTH).fill(0);
    this.visplanes.push(plane);
    return plane;
  }

  private checkPlane(plane: Visplane | null, start: number, stop: number): Visplane {
    if (plane === null) return this.findPlane(0, 0, 0);
    let intrl: number;
    let unionl: number;
    let intrh: number;
    let unionh: number;
    if (start < plane.minx) {
      intrl = plane.minx;
      unionl = start;
    } else {
      unionl = plane.minx;
      intrl = start;
    }
    if (stop > plane.maxx) {
      intrh = plane.maxx;
      unionh = stop;
    } else {
      unionh = plane.maxx;
      intrh = stop;
    }
    let x = intrl;
    while (x <= intrh) {
      if (x >= 0 && x < SCREENWIDTH && plane.top[x] !== 0xff) break;
      ++x;
    }
    if (x > intrh) {
      plane.minx = unionl;
      plane.maxx = unionh;
      return plane;
    }
    const copy = new Visplane(plane.height, plane.picnum, plane.lightlevel, start, stop);
    copy.top = new Array(SCREENWIDTH).fill(0xff);
    copy.bottom = new Array(SCREENWIDTH).fill(0);
    this.visplanes.push(copy);
    return copy;
  }

  private renderBspNode(world: World, bspnum: number): void {
    if ((bspnum & NF_SUBSECTOR) !== 0 || bspnum < 0) {
      this.subsector(world, bspnum === -1 ? 0 : bspnum & ~NF_SUBSECTOR);
      return;
    }
    const node = world.nodes[bspnum]!;
    const side = this.pointOnSide(this.viewx, this.viewy, node);
    this.renderBspNode(world, node.children[side]);
    this.renderBspNode(world, node.children[side ^ 1]);
  }

  private subsector(world: World, num: number): void {
    const sub = world.subsectors[num]!;
    this.frontsector = sub.sector;
    const light = Math.max(
      0,
      Math.min(LIGHTLEVELS - 1, (this.frontsector.lightlevel >> 4) + this.extralight),
    );
    this.walllights = this.scalelight[light]!;
    this.floorplane = this.findPlane(
      this.frontsector.floorheight,
      this.frontsector.floorpic,
      this.frontsector.lightlevel,
    );
    this.ceilingplane = this.findPlane(
      this.frontsector.ceilingheight,
      this.frontsector.ceilingpic,
      this.frontsector.lightlevel,
    );
    let line = sub.firstline;
    for (let i = 0; i < sub.numlines; ++i, ++line) {
      this.addLine(world.segs[line]);
    }
  }

  private addLine(line: any): void {
    this.curline = line;
    let angle1 = this.pointToAngle(line.v1.x, line.v1.y);
    let angle2 = this.pointToAngle(line.v2.x, line.v2.y);
    const span = asU32(angle1 - angle2);
    if (span >= ANG180) return;
    this.rw_angle1 = angle1;
    angle1 = asU32(angle1 - this.viewangle);
    angle2 = asU32(angle2 - this.viewangle);
    let tspan = asU32(angle1 + this.clipangle);
    if (tspan > asU32(2 * this.clipangle)) {
      tspan = asU32(tspan - 2 * this.clipangle);
      if (tspan >= span) return;
      angle1 = this.clipangle;
    }
    tspan = asU32(this.clipangle - angle2);
    if (tspan > asU32(2 * this.clipangle)) {
      tspan = asU32(tspan - 2 * this.clipangle);
      if (tspan >= span) return;
      angle2 = asU32(-this.clipangle);
    }
    const mask = intdiv(FINEANGLES, 2) - 1;
    const x1 = this.viewangletox[ushr(asU32(angle1 + ANG90), ANGLETOFINESHIFT) & mask]!;
    const x2 = this.viewangletox[ushr(asU32(angle2 + ANG90), ANGLETOFINESHIFT) & mask]!;
    if (x1 === x2) return;
    this.backsector = line.backsector;
    if (
      this.backsector === null ||
      this.backsector.ceilingheight <= this.frontsector.floorheight ||
      this.backsector.floorheight >= this.frontsector.ceilingheight
    ) {
      this.clipSolid(x1, x2 - 1);
    } else {
      this.clipPass(x1, x2 - 1);
    }
  }

  private clipSolid(first: number, last: number): void {
    if (first > last) return;
    let start = 0;
    while (start < this.newend && this.solidsegs[start]!.last < first - 1) ++start;
    if (start >= this.newend) {
      this.storeWallRange(first, last);
      return;
    }
    if (first < this.solidsegs[start]!.first) {
      if (last < this.solidsegs[start]!.first - 1) {
        this.storeWallRange(first, last);
        this.solidsegs.splice(start, 0, new RenderClipRange(first, last));
        ++this.newend;
        return;
      }
      this.storeWallRange(first, this.solidsegs[start]!.first - 1);
      this.solidsegs[start]!.first = first;
    }
    if (last <= this.solidsegs[start]!.last) return;
    let next = start;
    while (next + 1 < this.newend && last >= this.solidsegs[next + 1]!.first - 1) {
      this.storeWallRange(this.solidsegs[next]!.last + 1, this.solidsegs[next + 1]!.first - 1);
      ++next;
      if (last <= this.solidsegs[next]!.last) {
        this.solidsegs[start]!.last = this.solidsegs[next]!.last;
        this.crunchSolid(start, next);
        return;
      }
    }
    this.storeWallRange(this.solidsegs[next]!.last + 1, last);
    this.solidsegs[start]!.last = last;
    this.crunchSolid(start, next);
  }

  private crunchSolid(start: number, next: number): void {
    if (next === start) return;
    this.solidsegs.splice(start + 1, next - start);
    this.newend -= next - start;
    while (this.solidsegs.length < 64) this.solidsegs.push(new RenderClipRange());
  }

  private clipPass(first: number, last: number): void {
    if (first > last) return;
    let start = 0;
    while (start < this.newend && this.solidsegs[start]!.last < first - 1) ++start;
    if (start >= this.newend) {
      this.storeWallRange(first, last);
      return;
    }
    if (first < this.solidsegs[start]!.first) {
      if (last < this.solidsegs[start]!.first - 1) {
        this.storeWallRange(first, last);
        return;
      }
      this.storeWallRange(first, this.solidsegs[start]!.first - 1);
    }
    if (last <= this.solidsegs[start]!.last) return;
    let next = start;
    while (next + 1 < this.newend && last >= this.solidsegs[next + 1]!.first - 1) {
      this.storeWallRange(this.solidsegs[next]!.last + 1, this.solidsegs[next + 1]!.first - 1);
      ++next;
      if (last <= this.solidsegs[next]!.last) return;
    }
    this.storeWallRange(this.solidsegs[next]!.last + 1, last);
  }

  private storeWallRange(start: number, stop: number): void {
    if (start > stop) return;
    const line = this.curline;
    const linedef = line.linedef;
    const sidedef = line.sidedef;
    linedef.flags |= ML_MAPPED;
    this.rw_normalangle = asU32(line.angle + ANG90);
    let offsetangle = asU32(this.rw_normalangle - this.rw_angle1);
    if (offsetangle > ANG180) offsetangle = asU32(-offsetangle);
    offsetangle = Math.min(offsetangle, ANG90);
    const distangle = asU32(ANG90 - offsetangle);
    const hyp = this.pointToDist(line.v1.x, line.v1.y);
    this.rw_distance = fixedMul(hyp, finesine[(distangle >>> ANGLETOFINESHIFT) & FINEMASK]!);
    this.rw_x = start;
    this.rw_start = start;
    this.rw_stopx = stop + 1;
    this.rw_scale = this.scaleFromGlobalAngle(asU32(this.viewangle + this.xtoviewangle[start]!));
    this.rw_scalestep =
      stop > start
        ? Renderer.floorDiv(
            this.scaleFromGlobalAngle(asU32(this.viewangle + this.xtoviewangle[stop]!)) - this.rw_scale,
            stop - start,
          )
        : 0;
    this.worldtop = this.frontsector.ceilingheight - this.viewz;
    this.worldbottom = this.frontsector.floorheight - this.viewz;
    this.midtexture = this.toptexture = this.bottomtexture = 0;
    this.maskedtexture = false;
    this.maskedtexturecol = null;
    this.segtextured = false;
    if (this.backsector === null) {
      this.midtexture = sidedef.midtexture;
      this.markfloor = this.markceiling = true;
      this.rw_midtexturemid =
        (linedef.flags & ML_DONTPEGBOTTOM) !== 0
          ? this.frontsector.floorheight + this.res.textureHeight(this.midtexture) - this.viewz
          : this.worldtop;
      this.rw_midtexturemid += sidedef.rowoffset;
    } else {
      this.worldhigh = this.backsector.ceilingheight - this.viewz;
      this.worldlow = this.backsector.floorheight - this.viewz;
      if (
        this.frontsector.ceilingpic === this.res.skyflatnum &&
        this.backsector.ceilingpic === this.res.skyflatnum
      ) {
        this.worldtop = this.worldhigh;
      }
      this.markfloor =
        this.worldlow !== this.worldbottom ||
        this.backsector.floorpic !== this.frontsector.floorpic ||
        this.backsector.lightlevel !== this.frontsector.lightlevel;
      this.markceiling =
        this.worldhigh !== this.worldtop ||
        this.backsector.ceilingpic !== this.frontsector.ceilingpic ||
        this.backsector.lightlevel !== this.frontsector.lightlevel;
      if (
        this.backsector.ceilingheight <= this.frontsector.floorheight ||
        this.backsector.floorheight >= this.frontsector.ceilingheight
      ) {
        this.markfloor = this.markceiling = true;
      }
      if (this.worldhigh < this.worldtop) {
        this.toptexture = sidedef.toptexture;
        this.rw_toptexturemid =
          (linedef.flags & ML_DONTPEGTOP) !== 0
            ? this.worldtop
            : this.backsector.ceilingheight + this.res.textureHeight(this.toptexture) - this.viewz;
      }
      if (this.worldlow > this.worldbottom) {
        this.bottomtexture = sidedef.bottomtexture;
        this.rw_bottomtexturemid =
          (linedef.flags & ML_DONTPEGBOTTOM) !== 0 ? this.worldtop : this.worldlow;
      }
      this.rw_toptexturemid += sidedef.rowoffset;
      this.rw_bottomtexturemid += sidedef.rowoffset;
      if (sidedef.midtexture !== 0) {
        this.maskedtexture = true;
        this.maskedtexturecol = new Array(stop - start + 1).fill(Renderer.SHRT_MAX);
      }
    }
    this.segtextured =
      this.midtexture !== 0 ||
      this.toptexture !== 0 ||
      this.bottomtexture !== 0 ||
      this.maskedtexture;
    if (this.segtextured) {
      offsetangle = asU32(this.rw_normalangle - this.rw_angle1);
      if (offsetangle > ANG180) offsetangle = asU32(-offsetangle);
      this.rw_offset = fixedMul(hyp, finesine[(offsetangle >>> ANGLETOFINESHIFT) & FINEMASK]!);
      if (asU32(this.rw_normalangle - this.rw_angle1) < ANG180) this.rw_offset = -this.rw_offset;
      this.rw_offset += sidedef.textureoffset + line.offset;
      this.rw_centerangle = asU32(ANG90 + this.viewangle - this.rw_normalangle);
    }
    if (this.frontsector.floorheight >= this.viewz) this.markfloor = false;
    if (
      this.frontsector.ceilingheight <= this.viewz &&
      this.frontsector.ceilingpic !== this.res.skyflatnum
    ) {
      this.markceiling = false;
    }
    if (this.markceiling) this.ceilingplane = this.checkPlane(this.ceilingplane, start, stop);
    if (this.markfloor) this.floorplane = this.checkPlane(this.floorplane, start, stop);
    this.worldtop >>= 4;
    this.worldbottom >>= 4;
    this.topstep = -fixedMul(this.rw_scalestep, this.worldtop);
    this.topfrac = (this.centeryfrac >> 4) - fixedMul(this.worldtop, this.rw_scale);
    this.bottomstep = -fixedMul(this.rw_scalestep, this.worldbottom);
    this.bottomfrac = (this.centeryfrac >> 4) - fixedMul(this.worldbottom, this.rw_scale);
    if (this.backsector !== null) {
      this.worldhigh >>= 4;
      this.worldlow >>= 4;
      if (this.worldhigh < this.worldtop) {
        this.pixhigh = (this.centeryfrac >> 4) - fixedMul(this.worldhigh, this.rw_scale);
        this.pixhighstep = -fixedMul(this.rw_scalestep, this.worldhigh);
      }
      if (this.worldlow > this.worldbottom) {
        this.pixlow = (this.centeryfrac >> 4) - fixedMul(this.worldlow, this.rw_scale);
        this.pixlowstep = -fixedMul(this.rw_scalestep, this.worldlow);
      }
    }
    const scale1 = this.rw_scale;
    this.renderSegLoop();
    this.pushDrawseg(start, stop, scale1);
  }

  private pushDrawseg(start: number, stop: number, scale1: number): void {
    const ds = new DrawSeg();
    ds.x1 = start;
    ds.x2 = stop;
    ds.scale1 = scale1;
    ds.scale2 = scale1 + this.rw_scalestep * Math.max(0, stop - start);
    ds.curline = this.curline;
    ds.scalestep = this.rw_scalestep;
    ds.maskedtexturecol = this.maskedtexturecol;
    if (this.backsector === null) {
      ds.silhouette = SIL_BOTH;
      ds.bsilheight = Renderer.INT_MAX;
      ds.tsilheight = Renderer.INT_MIN;
      const width = stop - start + 1;
      ds.sprtopclip = new Array(width).fill(this.viewheight);
      ds.sprbottomclip = new Array(width).fill(-1);
    } else {
      ds.silhouette = SIL_NONE;
      if (this.frontsector.floorheight > this.backsector.floorheight) {
        ds.silhouette = SIL_BOTTOM;
        ds.bsilheight = this.frontsector.floorheight;
      } else if (this.backsector.floorheight > this.viewz) {
        ds.silhouette = SIL_BOTTOM;
        ds.bsilheight = Renderer.INT_MAX;
      }
      if (this.frontsector.ceilingheight < this.backsector.ceilingheight) {
        ds.silhouette |= SIL_TOP;
        ds.tsilheight = this.frontsector.ceilingheight;
      } else if (this.backsector.ceilingheight < this.viewz) {
        ds.silhouette |= SIL_TOP;
        ds.tsilheight = Renderer.INT_MIN;
      }
      if (this.backsector.ceilingheight <= this.frontsector.floorheight) {
        ds.silhouette |= SIL_BOTTOM;
        ds.bsilheight = Renderer.INT_MAX;
      }
      if (this.backsector.floorheight >= this.frontsector.ceilingheight) {
        ds.silhouette |= SIL_TOP;
        ds.tsilheight = Renderer.INT_MIN;
      }
      ds.sprtopclip = this.ceilingclip.slice(start, stop + 1);
      ds.sprbottomclip = this.floorclip.slice(start, stop + 1);
      if (this.maskedtexture) {
        if ((ds.silhouette & SIL_TOP) === 0) {
          ds.silhouette |= SIL_TOP;
          ds.tsilheight = Renderer.INT_MIN;
        }
        if ((ds.silhouette & SIL_BOTTOM) === 0) {
          ds.silhouette |= SIL_BOTTOM;
          ds.bsilheight = Renderer.INT_MAX;
        }
      }
    }
    this.drawsegs.push(ds);
  }

  private pointToDist(x: number, y: number): number {
    let dx = absFixed(x - this.viewx);
    let dy = absFixed(y - this.viewy);
    if (dy > dx) {
      const t = dx;
      dx = dy;
      dy = t;
    }
    if (dx === 0) return 0;
    const frac = fixedDiv(dy, dx);
    const ang = (tantoangle[Math.min(frac >> DBITS, 2048)]! + ANG90) >>> ANGLETOFINESHIFT;
    return fixedDiv(dx, finesine[ang & FINEMASK]!);
  }

  private renderSegLoop(): void {
    let texturecolumn = 0;
    while (this.rw_x < this.rw_stopx) {
      let yl = shar(this.topfrac + Renderer.HEIGHTUNIT - 1, Renderer.HEIGHTBITS);
      yl = Math.max(yl, this.ceilingclip[this.rw_x]! + 1);
      if (this.markceiling && this.ceilingplane !== null) {
        const top = this.ceilingclip[this.rw_x]! + 1;
        const bottom = Math.min(yl - 1, this.floorclip[this.rw_x]! - 1);
        if (top <= bottom) {
          this.ceilingplane.top[this.rw_x] = top;
          this.ceilingplane.bottom[this.rw_x] = bottom;
        }
      }
      const yh = Math.min(shar(this.bottomfrac, Renderer.HEIGHTBITS), this.floorclip[this.rw_x]! - 1);
      if (this.markfloor && this.floorplane !== null) {
        const top = Math.max(yh + 1, this.ceilingclip[this.rw_x]! + 1);
        const bottom = this.floorclip[this.rw_x]! - 1;
        if (top <= bottom) {
          this.floorplane.top[this.rw_x] = top;
          this.floorplane.bottom[this.rw_x] = bottom;
        }
      }
      if (this.segtextured) {
        const angle = ushr(asU32(this.rw_centerangle + this.xtoviewangle[this.rw_x]!), ANGLETOFINESHIFT);
        const tan = finetangent[angle & (intdiv(FINEANGLES, 2) - 1)]!;
        texturecolumn = shar(this.rw_offset - fixedMul(tan, this.rw_distance), FRACBITS);
        const index = Math.min(MAXLIGHTSCALE - 1, ushr(this.rw_scale, LIGHTSCALESHIFT));
        this.dc_colormap = this.fixedcolormap ?? this.res.colormap(this.walllights[index]!);
        this.dc_x = this.rw_x;
        this.dc_iscale = this.rw_scale !== 0 ? intdiv(0xffffffff, this.rw_scale) : 0;
      }
      if (this.midtexture !== 0) {
        this.dc_yl = yl;
        this.dc_yh = yh;
        this.dc_texturemid = this.rw_midtexturemid;
        this.dc_source = this.res.getColumn(this.midtexture, texturecolumn);
        this.drawColumn();
        this.ceilingclip[this.rw_x] = this.viewheight;
        this.floorclip[this.rw_x] = -1;
      } else {
        if (this.toptexture !== 0) {
          const mid = Math.min(shar(this.pixhigh, Renderer.HEIGHTBITS), this.floorclip[this.rw_x]! - 1);
          this.pixhigh += this.pixhighstep;
          if (mid >= yl) {
            this.dc_yl = yl;
            this.dc_yh = mid;
            this.dc_texturemid = this.rw_toptexturemid;
            this.dc_source = this.res.getColumn(this.toptexture, texturecolumn);
            this.drawColumn();
            this.ceilingclip[this.rw_x] = mid;
          } else {
            this.ceilingclip[this.rw_x] = yl - 1;
          }
        } else if (this.markceiling) {
          this.ceilingclip[this.rw_x] = yl - 1;
        }
        if (this.bottomtexture !== 0) {
          const mid = Math.max(
            shar(this.pixlow + Renderer.HEIGHTUNIT - 1, Renderer.HEIGHTBITS),
            this.ceilingclip[this.rw_x]! + 1,
          );
          this.pixlow += this.pixlowstep;
          if (mid <= yh) {
            this.dc_yl = mid;
            this.dc_yh = yh;
            this.dc_texturemid = this.rw_bottomtexturemid;
            this.dc_source = this.res.getColumn(this.bottomtexture, texturecolumn);
            this.drawColumn();
            this.floorclip[this.rw_x] = mid;
          } else {
            this.floorclip[this.rw_x] = yh + 1;
          }
        } else if (this.markfloor) {
          this.floorclip[this.rw_x] = yh + 1;
        }
        if (this.maskedtexture && this.maskedtexturecol !== null) {
          this.maskedtexturecol[this.rw_x - this.rw_start] = texturecolumn;
        }
      }
      this.rw_scale += this.rw_scalestep;
      this.topfrac += this.topstep;
      this.bottomfrac += this.bottomstep;
      ++this.rw_x;
    }
  }

  drawColumn(): void {
    let count = this.dc_yh - this.dc_yl;
    if (count < 0 || this.dc_x < 0 || this.dc_x >= this.viewwidth) return;
    const yl = Math.max(0, Math.min(SCREENHEIGHT - 1, this.dc_yl));
    let dest: number;
    let dest2: number | null;
    if (this.detailshift !== 0) {
      const x = this.dc_x << 1;
      if (x < 0 || x + 1 >= SCREENWIDTH) return;
      dest = this.ylookup[yl]! + this.columnofs[x]!;
      dest2 = dest + 1;
    } else {
      dest = this.ylookup[yl]! + this.columnofs[this.dc_x]!;
      dest2 = null;
    }
    const fracstep = this.dc_iscale;
    let frac = this.dc_texturemid + (this.dc_yl - this.centery) * fracstep;
    const slen = this.dc_source.length;
    const clen = this.dc_colormap.length;
    const limit = SCREENWIDTH * SCREENHEIGHT;
    while (count >= 0 && dest < limit) {
      const idx = (frac >> FRACBITS) & 127;
      if (slen !== 0) {
        const pix = this.dc_source[idx % slen]!;
        const value = pix < clen ? this.dc_colormap[pix]! : pix;
        this.fb[dest] = value;
        if (dest2 !== null && dest2 < limit) this.fb[dest2] = value;
      }
      dest += SCREENWIDTH;
      if (dest2 !== null) dest2 += SCREENWIDTH;
      frac = asI32(frac + fracstep);
      --count;
    }
  }

  drawMasked(): void {
    for (let i = this.drawsegs.length - 1; i >= 0; --i) {
      const ds = this.drawsegs[i]!;
      if (ds.maskedtexturecol && ds.maskedtexturecol.length > 0) {
        this.renderMaskedSegRange(ds, ds.x1, ds.x2);
      }
    }
  }

  renderMaskedSegRange(ds: DrawSeg, x1: number, x2: number): void {
    if (!ds.maskedtexturecol || ds.maskedtexturecol.length === 0 || ds.curline === null) return;
    const line = ds.curline;
    const front = line.frontsector;
    const back = line.backsector;
    const sidedef = line.sidedef;
    const texnum = sidedef?.midtexture ?? 0;
    if (texnum === 0 || back === null || front === null) return;
    let lightnum = (front.lightlevel >> 4) + this.extralight;
    if (line.v1.y === line.v2.y) --lightnum;
    else if (line.v1.x === line.v2.x) ++lightnum;
    const walllights = this.scalelight[Math.max(0, Math.min(LIGHTLEVELS - 1, lightnum))]!;
    let texturemid: number;
    if ((line.linedef.flags & ML_DONTPEGBOTTOM) !== 0) {
      texturemid = Math.max(front.floorheight, back.floorheight) + this.res.textureHeight(texnum) - this.viewz;
    } else {
      texturemid = Math.min(front.ceilingheight, back.ceilingheight) - this.viewz;
    }
    texturemid += sidedef.rowoffset;
    let spryscale = ds.scale1 + (x1 - ds.x1) * ds.scalestep;
    for (let x = x1; x <= x2; ++x, spryscale += ds.scalestep) {
      const i = x - ds.x1;
      if (i < 0 || i >= ds.maskedtexturecol.length) continue;
      const tcol = ds.maskedtexturecol[i]!;
      if (tcol === Renderer.SHRT_MAX) continue;
      let index = spryscale > 0 ? ushr(spryscale, LIGHTSCALESHIFT) : 0;
      index = Math.min(MAXLIGHTSCALE - 1, index);
      this.dc_colormap = this.fixedcolormap ?? this.res.colormap(walllights[index]!);
      this.dc_x = x;
      this.dc_iscale = spryscale !== 0 ? intdiv(0xffffffff, spryscale) : 0;
      this.dc_texturemid = texturemid;
      const topscreen = this.centeryfrac - fixedMul(texturemid, spryscale);
      const mceil = ds.sprtopclip[i] ?? -1;
      const mfloor = ds.sprbottomclip[i] ?? this.viewheight;
      this.drawMaskedColumn(this.res.columnPosts(texnum, tcol), topscreen, spryscale, mceil, mfloor);
      ds.maskedtexturecol[i] = Renderer.SHRT_MAX;
    }
  }

  private drawMaskedColumn(
    posts: Array<[number, Buffer]>,
    sprtopscreen: number,
    spryscale: number,
    mceil: number,
    mfloor: number,
  ): void {
    const basemid = this.dc_texturemid;
    for (const [topdelta, pixels] of posts) {
      const length = pixels.length;
      if (length === 0) continue;
      const topscreen = sprtopscreen + spryscale * topdelta;
      const bottomscreen = topscreen + spryscale * length;
      let yl = (topscreen + FRACUNIT - 1) >> FRACBITS;
      let yh = (bottomscreen - 1) >> FRACBITS;
      yh = Math.min(yh, mfloor - 1, this.viewheight - 1);
      yl = Math.max(yl, mceil + 1, 0);
      if (yl <= yh) {
        this.dc_yl = yl;
        this.dc_yh = yh;
        const buf = Buffer.alloc(128);
        pixels.copy(buf, 0, 0, Math.min(length, 128));
        this.dc_source = buf;
        this.dc_texturemid = basemid - (topdelta << FRACBITS);
        this.drawColumn();
      }
    }
    this.dc_texturemid = basemid;
  }

  private drawPlanes(): void {
    for (const plane of this.visplanes) {
      if (plane.minx > plane.maxx) continue;
      if (plane.picnum === this.res.skyflatnum) {
        this.dc_iscale = intdiv(9 * FRACUNIT, 10);
        this.dc_colormap = this.res.colormap(0);
        this.dc_texturemid = 100 * FRACUNIT;
        for (let x = plane.minx; x <= plane.maxx; ++x) {
          const yl = plane.top[x]!;
          const yh = plane.bottom[x]!;
          if (yl <= yh && yl < 0xff) {
            const ang = ushr(asU32(this.viewangle + this.xtoviewangle[x]!), Renderer.ANGLETOSKYSHIFT);
            this.dc_x = x;
            this.dc_yl = yl;
            this.dc_yh = yh;
            this.dc_source = this.res.getColumn(this.res.skytexture, ang);
            this.drawColumn();
          }
        }
        continue;
      }
      const light = Math.max(0, Math.min(LIGHTLEVELS - 1, (plane.lightlevel >> 4) + this.extralight));
      const planezlight = this.zlight[light]!;
      const flat = this.res.flatPixels(plane.picnum);
      const planeheight = absFixed(plane.height - this.viewz);
      if (planeheight === 0) continue;
      let cachedY = -1;
      let distance = 0;
      for (let x = Math.max(0, plane.minx); x < Math.min(this.viewwidth, plane.maxx + 1); ++x) {
        const t1 = plane.top[x]!;
        const b1 = plane.bottom[x]!;
        if (t1 > b1 || t1 === 0xff) continue;
        for (let y = t1; y <= Math.min(b1, this.viewheight - 1); ++y) {
          if (y !== cachedY) {
            cachedY = y;
            distance = fixedMul(planeheight, this.yslope[y]!);
          }
          const length = fixedMul(distance, this.distscale[x]!);
          const ang = ushr(asU32(this.viewangle + this.xtoviewangle[x]!), ANGLETOFINESHIFT) & FINEMASK;
          const xfrac = this.viewx + fixedMul(finesine[(ang + intdiv(FINEANGLES, 4)) & FINEMASK]!, length);
          const yfrac = -this.viewy - fixedMul(finesine[ang]!, length);
          const index = Math.min(MAXLIGHTZ - 1, ushr(distance, LIGHTZSHIFT));
          const cm = this.fixedcolormap ?? this.res.colormap(planezlight[index]!);
          const spot = ((xfrac >> 16) & 63) | ((yfrac >> 10) & 0x0fc0);
          const source = spot < flat.length ? flat[spot]! : 0;
          const pix = cm[source]!;
          if (this.detailshift !== 0) {
            const xx = x << 1;
            const off = this.ylookup[y]! + this.columnofs[xx]!;
            this.fb[off] = pix;
            this.fb[off + 1] = pix;
          } else {
            this.fb[this.ylookup[y]! + this.columnofs[x]!] = pix;
          }
        }
      }
    }
  }

  private static floorDiv(a: number, b: number): number {
    let q = intdiv(a, b);
    if (a % b !== 0 && a < 0 !== b < 0) --q;
    return q;
  }
}

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

import { i16, name8, u16 } from "./bin.ts";
import { asU32 } from "./compat.ts";
import {
  BOXBOTTOM,
  BOXLEFT,
  BOXRIGHT,
  BOXTOP,
  FRACUNIT,
  MAPLINEDEF_SIZE,
  MAPNODE_SIZE,
  MAPSECTOR_SIZE,
  MAPSEG_SIZE,
  MAPSIDEDEF_SIZE,
  MAPSUBSECTOR_SIZE,
  MAPTHING_SIZE,
  MAPVERTEX_SIZE,
  ML_TWOSIDED,
} from "./defs.ts";
import type { Mobj } from "./mobj.ts";
import type { Resources } from "./rdata.ts";
import type { Wad } from "./wad.ts";

export class Vertex {
  constructor(public x = 0, public y = 0) {}
}

export class Sector {
  floorheight = 0;
  ceilingheight = 0;
  floorpic = 0;
  ceilingpic = 0;
  lightlevel = 0;
  special = 0;
  tag = 0;
  lines: Line[] = [];
  specialdata: unknown = null;
  soundorg: unknown = null;
  iSector = 0;
  validcount = 0;
  soundtraversed = 0;
  soundtarget: Mobj | null = null;
}

export class Side {
  textureoffset = 0;
  rowoffset = 0;
  toptexture = 0;
  bottomtexture = 0;
  midtexture = 0;
  sector: Sector | null = null;
}

export class Line {
  v1: Vertex | null = null;
  v2: Vertex | null = null;
  dx = 0;
  dy = 0;
  flags = 0;
  special = 0;
  tag = 0;
  sidenum = [-1, -1];
  bbox = [0, 0, 0, 0];
  slopetype = 0;
  frontsector: Sector | null = null;
  backsector: Sector | null = null;
  sides: [Side | null, Side | null] = [null, null];
  iLine = 0;
  validcount = 0;
}

export class Seg {
  v1: Vertex | null = null;
  v2: Vertex | null = null;
  offset = 0;
  angle = 0;
  sidedef: Side | null = null;
  linedef: Line | null = null;
  frontsector: Sector | null = null;
  backsector: Sector | null = null;
}

export class Subsector {
  constructor(
    public numlines = 0,
    public firstline = 0,
    public sector: Sector | null = null,
  ) {}
}

export class Node {
  x = 0;
  y = 0;
  dx = 0;
  dy = 0;
  bbox: number[][] = [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ];
  children = [0, 0];
}

export class MapThing {
  constructor(
    public x = 0,
    public y = 0,
    public angle = 0,
    public type = 0,
    public options = 0,
  ) {}
}

export class World {
  vertexes: Vertex[] = [];
  sectors: Sector[] = [];
  sides: Side[] = [];
  lines: Line[] = [];
  segs: Seg[] = [];
  subsectors: Subsector[] = [];
  nodes: Node[] = [];
  things: MapThing[] = [];
  numnodes = 0;
  blockmap: number[] = [];
  bmaporgx = 0;
  bmaporgy = 0;
  bmapwidth = 0;
  bmapheight = 0;
  blockmaplump: Buffer = Buffer.alloc(0);
  validcount = 0;
  mobjs: Mobj[] = [];
  rejectmatrix: Buffer = Buffer.alloc(0);

  setupLevel(wad: Wad, res: Resources, episode: number, mapn: number): void {
    const mapName = `MAP${String(mapn).padStart(2, "0")}`;
    const lumpName = wad.checkNumForName(mapName) >= 0 ? mapName : `E${episode}M${mapn}`;
    const lump = wad.getNumForName(lumpName);
    this.loadVertexes(wad.cacheLumpNum(lump + 4));
    this.loadSectors(wad.cacheLumpNum(lump + 8), res);
    this.loadSides(wad.cacheLumpNum(lump + 3), res);
    this.loadLines(wad.cacheLumpNum(lump + 2));
    this.loadSegs(wad.cacheLumpNum(lump + 5));
    this.loadSubsectors(wad.cacheLumpNum(lump + 6));
    this.loadNodes(wad.cacheLumpNum(lump + 7));
    this.loadThings(wad.cacheLumpNum(lump + 1));
    this.loadBlockmap(wad.cacheLumpNum(lump + 10));
    this.rejectmatrix = wad.cacheLumpNum(lump + 9) ?? Buffer.alloc(0);
    this.numnodes = this.nodes.length;
    for (const ss of this.subsectors) {
      ss.sector = this.segs[ss.firstline]!.frontsector;
    }
  }

  private loadVertexes(data: Buffer): void {
    this.vertexes = [];
    for (let o = 0; o + MAPVERTEX_SIZE <= data.length; o += MAPVERTEX_SIZE) {
      this.vertexes.push(new Vertex(i16(data, o) * FRACUNIT, i16(data, o + 2) * FRACUNIT));
    }
  }

  private loadSectors(data: Buffer, res: Resources): void {
    this.sectors = [];
    for (let o = 0, i = 0; o + MAPSECTOR_SIZE <= data.length; o += MAPSECTOR_SIZE, i++) {
      const s = new Sector();
      s.floorheight = i16(data, o) * FRACUNIT;
      s.ceilingheight = i16(data, o + 2) * FRACUNIT;
      s.floorpic = res.flatNumForName(name8(data, o + 4));
      s.ceilingpic = res.flatNumForName(name8(data, o + 12));
      s.lightlevel = i16(data, o + 20);
      s.special = i16(data, o + 22);
      s.tag = i16(data, o + 24);
      s.iSector = i;
      this.sectors.push(s);
    }
  }

  private loadSides(data: Buffer, res: Resources): void {
    this.sides = [];
    for (let o = 0; o + MAPSIDEDEF_SIZE <= data.length; o += MAPSIDEDEF_SIZE) {
      const s = new Side();
      s.textureoffset = i16(data, o) * FRACUNIT;
      s.rowoffset = i16(data, o + 2) * FRACUNIT;
      s.toptexture = res.textureNumForName(name8(data, o + 4));
      s.bottomtexture = res.textureNumForName(name8(data, o + 12));
      s.midtexture = res.textureNumForName(name8(data, o + 20));
      const sec = i16(data, o + 28);
      s.sector = this.sectors[sec] ?? this.sectors[0]!;
      this.sides.push(s);
    }
  }

  private loadLines(data: Buffer): void {
    this.lines = [];
    for (let o = 0, i = 0; o + MAPLINEDEF_SIZE <= data.length; o += MAPLINEDEF_SIZE, i++) {
      const ln = new Line();
      ln.v1 = this.vertexes[i16(data, o)]!;
      ln.v2 = this.vertexes[i16(data, o + 2)]!;
      ln.dx = ln.v2.x - ln.v1.x;
      ln.dy = ln.v2.y - ln.v1.y;
      ln.flags = i16(data, o + 4);
      ln.special = i16(data, o + 6);
      ln.tag = i16(data, o + 8);
      const s0 = i16(data, o + 10);
      const s1 = i16(data, o + 12);
      ln.sidenum = [s0, s1];
      ln.sides = [s0 >= 0 ? this.sides[s0]! : null, s1 >= 0 ? this.sides[s1]! : null];
      ln.frontsector = ln.sides[0]?.sector ?? null;
      ln.backsector = ln.sides[1]?.sector ?? null;
      ln.bbox[BOXLEFT] = Math.min(ln.v1.x, ln.v2.x);
      ln.bbox[BOXRIGHT] = Math.max(ln.v1.x, ln.v2.x);
      ln.bbox[BOXBOTTOM] = Math.min(ln.v1.y, ln.v2.y);
      ln.bbox[BOXTOP] = Math.max(ln.v1.y, ln.v2.y);
      ln.iLine = i;
      if (ln.frontsector) ln.frontsector.lines.push(ln);
      if (ln.backsector && ln.backsector !== ln.frontsector) ln.backsector.lines.push(ln);
      this.lines.push(ln);
    }
  }

  private loadSegs(data: Buffer): void {
    this.segs = [];
    for (let o = 0; o + MAPSEG_SIZE <= data.length; o += MAPSEG_SIZE) {
      const s = new Seg();
      s.v1 = this.vertexes[i16(data, o)]!;
      s.v2 = this.vertexes[i16(data, o + 2)]!;
      s.angle = asU32(i16(data, o + 4) << 16);
      s.linedef = this.lines[i16(data, o + 6)]!;
      const side = i16(data, o + 8);
      s.offset = i16(data, o + 10) * FRACUNIT;
      s.sidedef = s.linedef.sides[side] ?? s.linedef.sides[0];
      s.frontsector = s.sidedef?.sector ?? null;
      s.backsector = s.linedef.flags & ML_TWOSIDED ? (s.linedef.sides[side ^ 1]?.sector ?? null) : null;
      this.segs.push(s);
    }
  }

  private loadSubsectors(data: Buffer): void {
    this.subsectors = [];
    for (let o = 0; o + MAPSUBSECTOR_SIZE <= data.length; o += MAPSUBSECTOR_SIZE) {
      this.subsectors.push(new Subsector(u16(data, o), u16(data, o + 2)));
    }
  }

  private loadNodes(data: Buffer): void {
    this.nodes = [];
    for (let o = 0; o + MAPNODE_SIZE <= data.length; o += MAPNODE_SIZE) {
      const nd = new Node();
      nd.x = i16(data, o) * FRACUNIT;
      nd.y = i16(data, o + 2) * FRACUNIT;
      nd.dx = i16(data, o + 4) * FRACUNIT;
      nd.dy = i16(data, o + 6) * FRACUNIT;
      let p = o + 8;
      nd.bbox = [];
      for (let child = 0; child < 2; child++, p += 8) {
        nd.bbox.push([
          i16(data, p) * FRACUNIT,
          i16(data, p + 2) * FRACUNIT,
          i16(data, p + 4) * FRACUNIT,
          i16(data, p + 6) * FRACUNIT,
        ]);
      }
      nd.children = [u16(data, p), u16(data, p + 2)];
      this.nodes.push(nd);
    }
  }

  private loadThings(data: Buffer): void {
    this.things = [];
    for (let o = 0; o + MAPTHING_SIZE <= data.length; o += MAPTHING_SIZE) {
      this.things.push(
        new MapThing(i16(data, o), i16(data, o + 2), i16(data, o + 4), i16(data, o + 6), i16(data, o + 8)),
      );
    }
  }

  private loadBlockmap(data: Buffer): void {
    this.blockmaplump = data;
    if (data.length < 8) return;
    this.bmaporgx = i16(data, 0) * FRACUNIT;
    this.bmaporgy = i16(data, 2) * FRACUNIT;
    this.bmapwidth = i16(data, 4);
    this.bmapheight = i16(data, 6);
  }

  playerStart(): MapThing | null {
    for (const thing of this.things) if (thing.type === 1) return thing;
    return this.things[0] ?? null;
  }
}

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

import { i16, i32, name8, u32 } from "./bin.ts";
import { FRACUNIT } from "./defs.ts";
import { initSpriteDefs, type SpriteFrame } from "./sprites.ts";
import type { Wad } from "./wad.ts";

/** Textures, flats, colormaps (r_data.c). */
export class TexPatch {
  constructor(
    public originx: number,
    public originy: number,
    public patch: number,
  ) {}
}

export class Texture {
  patches: TexPatch[] = [];
  widthmask = 0;
  columnofs: number[] = [];
  composite: number[] | null = null;
  colLump: number[] = [];
  colOfs: number[] = [];

  constructor(
    public name: string,
    public width: number,
    public height: number,
  ) {}
}

export class Resources {
  textures: Texture[] = [];
  texIndex: Record<string, number> = {};
  flatsFirst = 0;
  flatsLast = 0;
  flattranslation: number[] = [];
  texturetranslation: number[] = [];
  colormaps: Buffer = Buffer.alloc(0);
  skytexture = 0;
  skyflatnum = 0;
  sprites: Record<string, SpriteFrame[]> = {};

  constructor(public wad: Wad) {}

  init(): void {
    this.initTextures();
    this.initFlats();
    this.colormaps = this.wad.cacheLumpName("COLORMAP");
    this.skyflatnum = this.flatNumForName("F_SKY1");
    this.skytexture = this.textureNumForName("SKY1");
    this.sprites = initSpriteDefs(this.wad);
  }

  colormap(level: number): Buffer {
    level = Math.max(0, Math.min(31, level));
    return this.colormaps.subarray(level * 256, level * 256 + 256);
  }

  private initFlats(): void {
    this.flatsFirst = this.wad.getNumForName("F_START") + 1;
    this.flatsLast = this.wad.getNumForName("F_END") - 1;
    const count = this.flatsLast - this.flatsFirst + 1;
    this.flattranslation = count > 0 ? range0(count) : [];
  }

  flatNumForName(name: string): number {
    const index = this.wad.checkNumForName(name);
    return index < 0 ? 0 : index - this.flatsFirst;
  }

  flatLump(flatnum: number): number {
    if (flatnum < 0) flatnum = 0;
    const count = this.flatsLast - this.flatsFirst + 1;
    if (flatnum >= count) flatnum = 0;
    return this.flatsFirst + this.flattranslation[flatnum]!;
  }

  private initTextures(): void {
    const pnames = this.wad.cacheLumpName("PNAMES");
    const numMapPatches = i32(pnames, 0);
    const patchLookup: number[] = [];
    for (let i = 0; i < numMapPatches; i++) {
      patchLookup.push(this.wad.checkNumForName(name8(pnames, 4 + i * 8)));
    }

    const maptex1 = this.wad.cacheLumpName("TEXTURE1");
    const numTextures1 = i32(maptex1, 0);
    let maptex2: Buffer = Buffer.alloc(0);
    let numTextures2 = 0;
    if (this.wad.checkNumForName("TEXTURE2") >= 0) {
      maptex2 = this.wad.cacheLumpName("TEXTURE2");
      numTextures2 = i32(maptex2, 0);
    }

    for (let i = 0; i < numTextures1 + numTextures2; i++) {
      let offset: number;
      let src: Buffer;
      if (i < numTextures1) {
        offset = i32(maptex1, 4 + i * 4);
        src = maptex1;
      } else {
        offset = i32(maptex2, 4 + (i - numTextures1) * 4);
        src = maptex2;
      }
      const name = name8(src, offset);
      const width = i16(src, offset + 12);
      const height = i16(src, offset + 14);
      const patchCount = i16(src, offset + 20);
      const texture = new Texture(name, width, height);
      let patchOffset = offset + 22;
      for (let p = 0; p < patchCount; p++) {
        const originx = i16(src, patchOffset);
        const originy = i16(src, patchOffset + 2);
        const patchIndex = i16(src, patchOffset + 4);
        patchOffset += 10;
        const lump =
          patchIndex >= 0 && patchIndex < patchLookup.length ? patchLookup[patchIndex]! : -1;
        texture.patches.push(new TexPatch(originx, originy, lump));
      }
      let maskWidth = 1;
      while (maskWidth * 2 <= width) maskWidth *= 2;
      texture.widthmask = maskWidth - 1;
      texture.colLump = new Array(width).fill(-1);
      texture.colOfs = new Array(width).fill(0);
      this.texIndex[name] = this.textures.length;
      this.textures.push(texture);
    }

    const count = this.textures.length;
    this.texturetranslation = count > 0 ? range0(count) : [];
    for (const texture of this.textures) this.generateLookup(texture);
  }

  private generateLookup(texture: Texture): void {
    const patchCount = new Array(texture.width).fill(0);
    for (const mapPatch of texture.patches) {
      if (mapPatch.patch < 0) continue;
      const patchData = this.wad.cacheLumpNum(mapPatch.patch);
      const patchWidth = i16(patchData, 0);
      const x1 = mapPatch.originx;
      const x2 = Math.min(x1 + patchWidth, texture.width);
      let x = Math.max(x1, 0);
      while (x < x2) {
        patchCount[x]++;
        texture.colLump[x] = mapPatch.patch;
        texture.colOfs[x] = u32(patchData, 8 + (x - mapPatch.originx) * 4);
        x++;
      }
    }
    for (let x = 0; x < texture.width; x++) {
      if (patchCount[x] > 1) texture.colLump[x] = -1;
    }
  }

  private generateComposite(texture: Texture): void {
    if (texture.composite !== null) return;
    const buffer = new Array(texture.width * texture.height).fill(0);
    for (const mapPatch of texture.patches) {
      if (mapPatch.patch < 0) continue;
      const patchData = this.wad.cacheLumpNum(mapPatch.patch);
      const patchWidth = i16(patchData, 0);
      const x1 = mapPatch.originx;
      const x2 = Math.min(x1 + patchWidth, texture.width);
      let x = Math.max(x1, 0);
      while (x < x2) {
        const columnOffset = u32(patchData, 8 + (x - mapPatch.originx) * 4);
        this.drawColumnInCache(patchData, columnOffset, buffer, x, mapPatch.originy, texture);
        x++;
      }
    }
    texture.composite = buffer;
    for (let x = 0; x < texture.width; x++) {
      if (texture.colLump[x]! < 0) texture.colOfs[x] = x * texture.height;
    }
  }

  private drawColumnInCache(
    patch: Buffer,
    column: number,
    cache: number[],
    x: number,
    originy: number,
    texture: Texture,
  ): void {
    const patchLength = patch.length;
    while (column < patchLength) {
      const topDelta = patch[column]!;
      if (topDelta === 0xff) break;
      const length = patch[column + 1]!;
      let source = column + 3;
      let position = originy + topDelta;
      let count = length;
      if (position < 0) {
        count += position;
        source -= position;
        position = 0;
      }
      if (position + count > texture.height) {
        count = texture.height - position;
      }
      const dest = x * texture.height + position;
      for (let i = 0; i < count; i++) {
        cache[dest + i] = patch[source + i]!;
      }
      column += length + 4;
    }
  }

  textureNumForName(name: string): number {
    const key = name.toUpperCase().replace(/[\s\0]+$/, "").slice(0, 8);
    if (key === "-" || key === "") return 0;
    return this.texIndex[key] ?? 0;
  }

  textureHeight(texnum: number): number {
    return this.textures[texnum]!.height * FRACUNIT;
  }

  textureWidth(texnum: number): number {
    return this.textures[texnum]!.width;
  }

  columnPosts(texnum: number, col: number): Array<[number, Buffer]> {
    if (texnum <= 0 || texnum >= this.textures.length) return [];
    const texture = this.textures[texnum]!;
    col &= texture.widthmask;
    const lump = texture.colLump[col]!;
    const posts: Array<[number, Buffer]> = [];
    if (lump >= 0) {
      const patch = this.wad.cacheLumpNum(lump);
      let column = texture.colOfs[col]!;
      const patchLength = patch.length;
      while (column < patchLength) {
        const topDelta = patch[column]!;
        if (topDelta === 0xff) break;
        const length = patch[column + 1]!;
        posts.push([topDelta, Buffer.from(patch.subarray(column + 3, column + 3 + length))]);
        column += length + 4;
      }
      return posts;
    }
    this.generateComposite(texture);
    const offset = texture.colOfs[col]!;
    const columnBytes = bytesFromArray(texture.composite ?? [], offset, texture.height);
    if (columnBytes.length !== 0) posts.push([0, columnBytes]);
    return posts;
  }

  getColumn(texnum: number, col: number): Buffer {
    const texture = this.textures[texnum]!;
    col &= texture.widthmask;
    const lump = texture.colLump[col]!;
    if (lump >= 0) {
      return this.columnToSource(this.wad.cacheLumpNum(lump), texture.colOfs[col]!, texture.height);
    }
    this.generateComposite(texture);
    const columnBytes = bytesFromArray(texture.composite ?? [], texture.colOfs[col]!, texture.height);
    return this.repeatColumn(columnBytes);
  }

  private columnToSource(patch: Buffer, column: number, height: number): Buffer {
    const buffer = Buffer.alloc(128);
    const patchLength = patch.length;
    while (column < patchLength) {
      const topDelta = patch[column]!;
      if (topDelta === 0xff) break;
      const length = patch[column + 1]!;
      const source = column + 3;
      for (let i = 0; i < length; i++) {
        const y = topDelta + i;
        if (y >= 0 && y < 128) buffer[y] = patch[source + i]!;
      }
      column += length + 4;
    }
    return buffer;
  }

  private repeatColumn(columnBytes: Buffer): Buffer {
    if (columnBytes.length === 0) return Buffer.alloc(128);
    const length = columnBytes.length;
    const buffer = Buffer.alloc(128);
    for (let i = 0; i < 128; i++) buffer[i] = columnBytes[i % length]!;
    return buffer;
  }

  flatPixels(flatnum: number): Buffer {
    const data = this.wad.cacheLumpNum(this.flatLump(flatnum));
    if (data.length >= 4096) return data.subarray(0, 4096);
    const out = Buffer.alloc(4096);
    data.copy(out, 0, 0, data.length);
    return out;
  }
}

function range0(count: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(i);
  return out;
}

function bytesFromArray(bytes: number[], offset = 0, length?: number): Buffer {
  const slice = length === undefined ? bytes.slice(offset) : bytes.slice(offset, offset + length);
  if (slice.length === 0) return Buffer.alloc(0);
  return Buffer.from(slice.map((b) => b & 0xff));
}

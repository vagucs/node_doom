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

import { u32 } from "./bin.ts";
import { asI32, asU32, fixedDiv, fixedMul, intdiv, ushr } from "./compat.ts";
import {
  ANG45,
  FINEANGLES,
  FINEMASK,
  FRACBITS,
  FRACUNIT,
  MF_NOSECTOR,
  MF_SHADOW,
  SCREENWIDTH,
  SIL_BOTTOM,
  SIL_TOP,
} from "./defs.ts";
import { FF_FRAMEMASK } from "./info.ts";
import type { Mobj } from "./mobj.ts";
import type { Player } from "./player.ts";
import type { Resources } from "./rdata.ts";
import type { Renderer } from "./render.ts";
import { finesine } from "./tables.ts";
import { patchSize } from "./vvideo.ts";
import type { Wad } from "./wad.ts";
import type { World } from "./world.ts";

export class SpriteFrame {
  rotate = -1;
  lump: number[];
  flip: number[];

  constructor() {
    this.lump = new Array(8).fill(-1);
    this.flip = new Array(8).fill(0);
  }
}

interface SpriteDraw {
  mo?: Mobj;
  patch: Buffer;
  w: number;
  scale: number;
  gx?: number;
  gy?: number;
  gz?: number;
  gzt?: number;
  texturemid: number;
  x1: number;
  x2: number;
  xiscale: number;
  startfrac: number;
}

/** R_InitSpriteDefs: parse S_START..S_END, including mirrored POSSA2A8 lumps. */
export function initSpriteDefs(wad: Wad): Record<string, SpriteFrame[]> {
  return Sprites.initSpriteDefs(wad);
}

export class Sprites {
  static readonly BASEYCENTER = 100;
  static readonly WEAPONTOP = 32 * FRACUNIT;
  static readonly WEAPONBOTTOM = 128 * FRACUNIT;
  static readonly LOWERSPEED = 6 * FRACUNIT;
  static readonly RAISESPEED = 6 * FRACUNIT;

  private static readonly MINZ = 4 * FRACUNIT;
  private static readonly MAX_SPRITE_FRAMES = 29;
  private static readonly FUZZ_DIR = [
    1, -1, 1, -1, 1, 1, -1, 1, 1, -1, 1, 1, 1, -1, 1, 1, 1, -1, -1, -1, -1, 1, -1, -1, 1,
    1, 1, 1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, -1, -1, -1, 1, 1, 1, 1, -1, 1, 1, -1, 1,
  ];
  private static fuzzPos = 0;

  /** R_InitSpriteDefs: parse S_START..S_END, including mirrored POSSA2A8 lumps. */
  static initSpriteDefs(wad: {
    checkNumForName(name: string): number;
    numLumps(): number;
    lumpName(num: number): string;
  }): Record<string, SpriteFrame[]> {
    let start = wad.checkNumForName("S_START");
    let end = wad.checkNumForName("S_END");
    if (start < 0) start = wad.checkNumForName("SS_START");
    if (end < 0) end = wad.checkNumForName("SS_END");
    let first: number;
    let last: number;
    if (start >= 0 && end > start) {
      first = start + 1;
      last = end - 1;
    } else {
      first = 0;
      last = wad.numLumps() - 1;
    }

    const buckets: Record<string, number[]> = {};
    for (let lump = first; lump <= last; ++lump) {
      const name = wad.lumpName(lump);
      if (name.length < 6) continue;
      const base = name.slice(0, 4);
      (buckets[base] ??= []).push(lump);
    }

    const result: Record<string, SpriteFrame[]> = {};
    for (const spriteName of Object.keys(buckets)) {
      const lumps = buckets[spriteName]!;
      const frames: SpriteFrame[] = [];
      for (let i = 0; i < Sprites.MAX_SPRITE_FRAMES; ++i) frames.push(new SpriteFrame());
      let maxFrame = -1;
      for (const lump of lumps) {
        const name = wad.lumpName(lump);
        const frame = name.charCodeAt(4) - 65;
        const rotation = name.charCodeAt(5) - 48;
        if (Sprites.installSpriteLump(frames, lump, frame, rotation, false)) {
          maxFrame = Math.max(maxFrame, frame);
        }
        if (name.length >= 8 && name[6]! >= "A" && name[6]! <= "]") {
          const frame2 = name.charCodeAt(6) - 65;
          const rotation2 = name.charCodeAt(7) - 48;
          if (Sprites.installSpriteLump(frames, lump, frame2, rotation2, true)) {
            maxFrame = Math.max(maxFrame, frame2);
          }
        }
      }
      if (maxFrame >= 0) {
        for (let frameIndex = 0; frameIndex <= maxFrame; frameIndex++) {
          const slot = frames[frameIndex]!;
          if (slot.rotate === -1) {
            process.stderr.write(
              `R_InitSprites: No patches found for ${spriteName} frame ${String.fromCharCode(65 + frameIndex)}\n`,
            );
            slot.rotate = 0;
          }
        }
        result[spriteName] = frames.slice(0, maxFrame + 1);
      }
    }
    return result;
  }

  private static installSpriteLump(
    frames: SpriteFrame[],
    lump: number,
    frame: number,
    rotation: number,
    flipped: boolean,
  ): boolean {
    if (frame < 0 || frame >= Sprites.MAX_SPRITE_FRAMES || rotation < 0 || rotation > 8) {
      return false;
    }
    const spriteFrame = frames[frame]!;
    if (rotation === 0) {
      if (spriteFrame.rotate === 1) return true;
      spriteFrame.rotate = 0;
      for (let r = 0; r < 8; ++r) {
        spriteFrame.lump[r] = lump;
        spriteFrame.flip[r] = flipped ? 1 : 0;
      }
      return true;
    }
    if (spriteFrame.rotate === 0) return true;
    spriteFrame.rotate = 1;
    const index = rotation - 1;
    if (spriteFrame.lump[index]! < 0) {
      spriteFrame.lump[index] = lump;
      spriteFrame.flip[index] = flipped ? 1 : 0;
    }
    return true;
  }

  static lookupSprite(
    resources: Resources,
    name: string,
    angleToThing: number,
    mobjAngle: number,
    frame: number,
  ): [number, number] | null {
    const base = name.slice(0, 4).toUpperCase();
    const frames = resources.sprites[base] ?? null;
    if (!frames) return null;
    const frameIndex = frame & FF_FRAMEMASK;
    if (frameIndex >= frames.length) return null;
    const spriteFrame = frames[frameIndex]!;
    let lump: number;
    let flip: number;
    if (spriteFrame.rotate !== 0) {
      const rotation =
        ushr(asU32(angleToThing - mobjAngle + intdiv(ANG45, 2) * 9), 29) & 7;
      lump = spriteFrame.lump[rotation]!;
      flip = spriteFrame.flip[rotation]!;
    } else {
      lump = spriteFrame.lump[0]!;
      flip = spriteFrame.flip[0]!;
    }
    return lump < 0 ? null : [lump, flip];
  }

  static drawSprites(renderer: Renderer, world: World, fb: Uint8Array): void {
    const visible: SpriteDraw[] = [];
    for (const mobj of world.mobjs) {
      if ((mobj.sprite ?? "") === "" || (mobj.player ?? null) !== null || (mobj.flags & MF_NOSECTOR) !== 0) continue;
      const item = Sprites.project(renderer, mobj);
      if (item !== null) visible.push(item);
    }
    visible.sort((a, b) => a.scale - b.scale);
    for (const sprite of visible) Sprites.drawSprite(renderer, fb, sprite);
  }

  private static project(renderer: Renderer, mobj: Mobj): SpriteDraw | null {
    const trX = asI32(mobj.x - renderer.viewx);
    const trY = asI32(mobj.y - renderer.viewy);
    let gxt = fixedMul(trX, renderer.viewcos);
    let gyt = -fixedMul(trY, renderer.viewsin);
    const tz = gxt - gyt;
    if (tz < Sprites.MINZ) return null;
    const xscale = fixedDiv(renderer.projection, tz);
    gxt = -fixedMul(trX, renderer.viewsin);
    gyt = fixedMul(trY, renderer.viewcos);
    let tx = -(gyt + gxt);
    if (Math.abs(tx) > tz * 4) return null;
    const found = Sprites.lookupSprite(
      renderer.res,
      String(mobj.sprite),
      renderer.pointToAngle(mobj.x, mobj.y),
      mobj.angle,
      mobj.frame ?? 0,
    );
    if (found === null) return null;
    const [lump, flip] = found;
    const patch = renderer.res.wad.cacheLumpNum(lump);
    const [width, , left, top] = patchSize(patch);
    tx -= left * FRACUNIT;
    const x1 = (renderer.centerxfrac + fixedMul(tx, xscale)) >> FRACBITS;
    if (x1 > renderer.viewwidth) return null;
    tx += width * FRACUNIT;
    const x2 = ((renderer.centerxfrac + fixedMul(tx, xscale)) >> FRACBITS) - 1;
    if (x2 < 0) return null;
    const iscale = xscale !== 0 ? fixedDiv(FRACUNIT, xscale) : FRACUNIT;
    const xiscale = flip !== 0 ? -iscale : iscale;
    let startfrac = flip !== 0 ? (width << FRACBITS) - 1 : 0;
    const visibleX1 = Math.max(x1, 0);
    const visibleX2 = Math.min(x2, renderer.viewwidth - 1);
    if (visibleX1 > x1) startfrac += xiscale * (visibleX1 - x1);
    return {
      mo: mobj,
      patch,
      w: width,
      scale: xscale << renderer.detailshift,
      gx: mobj.x,
      gy: mobj.y,
      gz: mobj.z,
      gzt: mobj.z + top * FRACUNIT,
      texturemid: mobj.z + top * FRACUNIT - renderer.viewz,
      x1: visibleX1,
      x2: visibleX2,
      xiscale,
      startfrac,
    };
  }

  private static pointOnSegSide(x: number, y: number, line: any): number {
    const lx = line.v1.x;
    const ly = line.v1.y;
    const ldx = line.v2.x - lx;
    const ldy = line.v2.y - ly;
    if (ldx === 0) {
      if (x <= lx) return ldy > 0 ? 1 : 0;
      return ldy < 0 ? 1 : 0;
    }
    if (ldy === 0) {
      if (y <= ly) return ldx < 0 ? 1 : 0;
      return ldx > 0 ? 1 : 0;
    }
    const dx = x - lx;
    const dy = y - ly;
    const left = fixedMul(ldy >> FRACBITS, dx);
    const right = fixedMul(dy, ldx >> FRACBITS);
    return right < left ? 0 : 1;
  }

  private static clipAgainstWalls(renderer: Renderer, sprite: SpriteDraw): [number[], number[]] {
    const x1 = sprite.x1;
    const x2 = sprite.x2;
    const clipBottom = new Array(SCREENWIDTH).fill(-2);
    const clipTop = new Array(SCREENWIDTH).fill(-2);
    for (let d = renderer.drawsegs.length - 1; d >= 0; --d) {
      const drawseg = renderer.drawsegs[d]!;
      if (drawseg.x1 > x2 || drawseg.x2 < x1) continue;
      if (drawseg.silhouette === 0 && (!drawseg.maskedtexturecol || drawseg.maskedtexturecol.length === 0)) {
        continue;
      }
      const range1 = Math.max(drawseg.x1, x1);
      const range2 = Math.min(drawseg.x2, x2);
      const scale = Math.max(drawseg.scale1, drawseg.scale2);
      const lowScale = Math.min(drawseg.scale1, drawseg.scale2);
      const inFront =
        scale < sprite.scale ||
        (lowScale < sprite.scale &&
          drawseg.curline !== null &&
          Sprites.pointOnSegSide(sprite.gx!, sprite.gy!, drawseg.curline) === 0);
      if (inFront) {
        if (drawseg.maskedtexturecol && drawseg.maskedtexturecol.length > 0) {
          renderer.renderMaskedSegRange(drawseg, range1, range2);
        }
        continue;
      }
      let silhouette = drawseg.silhouette;
      if (sprite.gz! >= drawseg.bsilheight) silhouette &= ~SIL_BOTTOM;
      if (sprite.gzt! <= drawseg.tsilheight) silhouette &= ~SIL_TOP;
      for (let x = range1; x <= range2; ++x) {
        const i = x - drawseg.x1;
        if (i < 0 || i >= drawseg.sprtopclip.length) continue;
        if ((silhouette & SIL_BOTTOM) !== 0 && clipBottom[x] === -2) {
          clipBottom[x] = drawseg.sprbottomclip[i];
        }
        if ((silhouette & SIL_TOP) !== 0 && clipTop[x] === -2) {
          clipTop[x] = drawseg.sprtopclip[i];
        }
      }
    }
    for (let x = x1; x <= x2; ++x) {
      if (clipBottom[x] === -2) clipBottom[x] = renderer.viewheight;
      if (clipTop[x] === -2) clipTop[x] = -1;
    }
    return [clipTop, clipBottom];
  }

  static drawPsprite(
    renderer: Renderer,
    fb: Uint8Array,
    patch: Buffer,
    sx: number,
    sy: number,
  ): void {
    const [width, , left, top] = patchSize(patch);
    let tx = sx - 160 * FRACUNIT;
    tx -= left * FRACUNIT;
    const x1 = (renderer.centerxfrac + fixedMul(tx, renderer.pspritescale)) >> FRACBITS;
    if (x1 > renderer.viewwidth) return;
    tx += width * FRACUNIT;
    const x2 = ((renderer.centerxfrac + fixedMul(tx, renderer.pspritescale)) >> FRACBITS) - 1;
    if (x2 < 0) return;
    const visibleX1 = Math.max(x1, 0);
    const visibleX2 = Math.min(x2, renderer.viewwidth - 1);
    const startfrac = visibleX1 > x1 ? renderer.pspriteiscale * (visibleX1 - x1) : 0;
    const texturemid =
      Sprites.BASEYCENTER * FRACUNIT + intdiv(FRACUNIT, 2) - (sy - top * FRACUNIT);

    Sprites.drawSprite(
      renderer,
      fb,
      {
        patch,
        w: width,
        scale: renderer.pspritescale << renderer.detailshift,
        texturemid,
        x1: visibleX1,
        x2: visibleX2,
        xiscale: renderer.pspriteiscale,
        startfrac,
      },
      false,
    );
  }

  static weaponPspriteXY(player: Player, leveltime: number): [number, number] {
    const state = player.pspriteState;
    if (state === "up" || state === "down") {
      return [FRACUNIT, player.pspriteSy];
    }
    if (state === "atk") {
      return [FRACUNIT, player.pspriteSy || Sprites.WEAPONTOP];
    }
    const bob = player.bob;
    let angle = (128 * leveltime) & FINEMASK;
    const sx =
      FRACUNIT +
      fixedMul(bob, finesine[(angle + intdiv(FINEANGLES, 4)) % finesine.length]!);
    angle &= intdiv(FINEANGLES, 2) - 1;
    const sy = Sprites.WEAPONTOP + fixedMul(bob, finesine[angle]!);
    player.pspriteSy = sy;
    return [sx, sy];
  }

  private static drawSprite(
    renderer: Renderer,
    fb: Uint8Array,
    sprite: SpriteDraw,
    clipWalls = true,
  ): void {
    const patch = sprite.patch;
    const patchWidth = sprite.w;
    const iscale = sprite.xiscale;
    const spryscale = sprite.scale;
    let yIscale = Math.abs(iscale) >> renderer.detailshift;
    yIscale = Math.max(1, yIscale);
    const sprTopScreen = renderer.centeryfrac - fixedMul(sprite.texturemid, spryscale);
    let clipTop: number[];
    let clipBottom: number[];
    if (clipWalls) {
      [clipTop, clipBottom] = Sprites.clipAgainstWalls(renderer, sprite);
    } else {
      clipTop = new Array(SCREENWIDTH).fill(-1);
      clipBottom = new Array(SCREENWIDTH).fill(renderer.viewheight);
    }
    const columnOffsets: number[] = [];
    for (let column = 0; column < Math.max(1, patchWidth); ++column) {
      columnOffsets[column] = u32(patch, 8 + column * 4);
    }
    const fuzz = !!(sprite.mo && (sprite.mo.flags & MF_SHADOW));
    const colormap = fuzz ? renderer.res.colormap(6) : renderer.fixedcolormap ?? renderer.res.colormap(0);
    const patchLength = patch.length;
    let frac = sprite.startfrac;
    for (let x = sprite.x1; x <= sprite.x2; ++x) {
      const columnNumber = frac >> FRACBITS;
      if (columnNumber >= 0 && columnNumber < patchWidth) {
        let column = columnOffsets[columnNumber]!;
        while (column < patchLength) {
          const topDelta = patch[column]!;
          if (topDelta === 0xff) break;
          const length = patch[column + 1]!;
          const source = column + 3;
          const topScreen = sprTopScreen + spryscale * topDelta;
          const bottomScreen = topScreen + spryscale * length;
          let yl = (topScreen + FRACUNIT - 1) >> FRACBITS;
          let yh = (bottomScreen - 1) >> FRACBITS;
          yl = Math.max(yl, clipTop[x]! + 1, 0);
          yh = Math.min(yh, clipBottom[x]! - 1, renderer.viewheight - 1);
          if (fuzz) {
            yl = Math.max(yl, 1);
            yh = Math.min(yh, renderer.viewheight - 2);
          }
          if (yl <= yh) {
            let texfrac = fixedMul((yl << FRACBITS) - topScreen, yIscale);
            texfrac = Math.max(0, texfrac);
            for (let y = yl; y <= yh; ++y) {
              if (fuzz) {
                Sprites.drawFuzzPixel(renderer, fb, x, y, colormap);
              } else {
                const index = texfrac >> FRACBITS;
                if (index >= 0 && index < length) {
                  const pixel = patch[source + index]!;
                  const value = pixel < colormap.length ? colormap[pixel]! : pixel;
                  if (renderer.detailshift !== 0) {
                    const xx = x << 1;
                    const offset = renderer.ylookup[y]! + renderer.columnofs[xx]!;
                    fb[offset] = value;
                    fb[offset + 1] = value;
                  } else {
                    fb[renderer.ylookup[y]! + renderer.columnofs[x]!] = value;
                  }
                }
              }
              texfrac += yIscale;
            }
          }
          column += length + 4;
        }
      }
      frac += iscale;
    }
  }

  private static drawFuzzPixel(
    renderer: Renderer,
    fb: Uint8Array,
    x: number,
    y: number,
    colormap: Buffer | Uint8Array,
  ): void {
    const dest = renderer.ylookup[y]! + renderer.columnofs[renderer.detailshift !== 0 ? x << 1 : x]!;
    let src = dest + Sprites.FUZZ_DIR[Sprites.fuzzPos]! * SCREENWIDTH;
    Sprites.fuzzPos = (Sprites.fuzzPos + 1) % Sprites.FUZZ_DIR.length;
    if (src < 0 || src >= fb.length) src = dest;
    const pixel = fb[src]! & 255;
    const value = pixel < colormap.length ? colormap[pixel]! : pixel;
    fb[dest] = value;
    if (renderer.detailshift !== 0 && dest + 1 < fb.length) fb[dest + 1] = value;
  }
}

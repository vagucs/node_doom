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

import { i16, u32 } from "./bin.ts";
import { SCREENHEIGHT, SCREENWIDTH } from "./defs.ts";

export type Framebuffer = Uint8Array;

export function patchSize(patch: Buffer): [number, number, number, number] {
  return [i16(patch, 0), i16(patch, 2), i16(patch, 4), i16(patch, 6)];
}

export function drawPatch(fb: Framebuffer, x: number, y: number, patch: Buffer, flipped = false): void {
  const [width, , left, top] = patchSize(patch);
  x -= left;
  y -= top;
  let destTop = y * SCREENWIDTH + x;
  const patchLength = patch.length;
  const screenSize = SCREENWIDTH * SCREENHEIGHT;
  for (let col = 0; col < width; col++) {
    const srcCol = flipped ? width - 1 - col : col;
    let column = u32(patch, 8 + srcCol * 4);
    while (column < patchLength) {
      const topDelta = patch[column]!;
      if (topDelta === 0xff) break;
      const length = patch[column + 1]!;
      let source = column + 3;
      let dest = destTop + topDelta * SCREENWIDTH;
      for (let i = 0; i < length; i++) {
        if (dest >= 0 && dest < screenSize) fb[dest] = patch[source]!;
        source++;
        dest += SCREENWIDTH;
      }
      column += length + 4;
    }
    destTop++;
  }
}

export function drawPatchDirect(fb: Framebuffer, x: number, y: number, patch: Buffer): void {
  drawPatch(fb, x, y, patch);
}

export function copyRect(
  dest: Framebuffer,
  src: Framebuffer | Buffer,
  srcx: number,
  srcy: number,
  width: number,
  height: number,
  destx: number,
  desty: number,
): void {
  for (let row = 0; row < height; row++) {
    const source = (srcy + row) * SCREENWIDTH + srcx;
    const target = (desty + row) * SCREENWIDTH + destx;
    for (let col = 0; col < width; col++) dest[target + col] = src[source + col]!;
  }
}

export function fill(fb: Framebuffer, color = 0): void {
  fb.fill(color & 0xff);
}

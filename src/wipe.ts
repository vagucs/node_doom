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

import { intdiv } from "./compat.ts";
import { SCREENHEIGHT, SCREENWIDTH } from "./defs.ts";

function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

export class Wipe {
  private start: Uint8Array = new Uint8Array(0);
  private end: Uint8Array = new Uint8Array(0);
  private y: number[] = [];
  active = false;

  captureStart(fb: Uint8Array): void {
    this.start = fb.slice();
  }

  captureEnd(fb: Uint8Array): void {
    this.end = fb.slice();
  }

  begin(fb: Uint8Array): void {
    fb.set(this.start);
    const columns = intdiv(SCREENWIDTH, 2);
    this.y = new Array(columns).fill(0);
    this.y[0] = -randomInt(0, 15);
    for (let i = 1; i < columns; ++i) {
      const next = this.y[i - 1]! + randomInt(-1, 1);
      this.y[i] = next > 0 ? 0 : next === -16 ? -15 : next;
    }
    this.active = true;
  }

  tick(tics: number, fb: Uint8Array): boolean {
    const height = SCREENHEIGHT;
    const width = SCREENWIDTH;
    let done = true;
    for (let tic = 0; tic < Math.max(1, tics); ++tic) {
      for (let column = 0; column < this.y.length; ++column) {
        let y = this.y[column]!;
        const x = column * 2;
        if (y < 0) {
          for (let row = 0; row < height; ++row) {
            const off = row * width + x;
            fb[off] = this.start[off]!;
            fb[off + 1] = this.start[off + 1]!;
          }
          this.y[column] = y + 1;
          done = false;
          continue;
        }
        if (y >= height) continue;
        let dy = y < 16 ? y + 1 : 8;
        dy = Math.min(dy, height - y);
        for (let row = 0; row < dy; ++row) {
          const off = (y + row) * width + x;
          fb[off] = this.end[off]!;
          fb[off + 1] = this.end[off + 1]!;
        }
        y += dy;
        this.y[column] = y;
        for (let row = y; row < height; ++row) {
          const src = (row - y) * width + x;
          const dst = row * width + x;
          fb[dst] = this.start[src]!;
          fb[dst + 1] = this.start[src + 1]!;
        }
        done = false;
      }
    }
    if (done) {
      fb.set(this.end);
      this.active = false;
    }
    return done;
  }
}

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

import { fixedDiv, fixedMul, intdiv, shar } from "./compat.ts";
import {
  FRACUNIT,
  GS_LEVEL,
  ML_DONTDRAW,
  ML_MAPPED,
  ML_SECRET,
  PLAYER_RADIUS,
  SBARHEIGHT,
  SCREENHEIGHT,
  SCREENWIDTH,
} from "./defs.ts";
import type { Game } from "./game.ts";
import { DOWN, isMinus, isPlus, LEFT, RIGHT, TAB, UP } from "./keys.ts";
import { fineCos, fineSin } from "./tables.ts";
import { drawPatch } from "./vvideo.ts";

type Shape = Array<[number, number, number, number]>;

export class AmMap {
  private static readonly REDS = 176;
  private static readonly RED_RANGE = 16;
  private static readonly GREENS = 112;
  private static readonly GRAYS = 96;
  private static readonly BROWNS = 64;
  private static readonly YELLOWS = 231;
  private static readonly WHITE = 209;
  private static readonly GRID_COLOR = 104;
  private static readonly INIT_SCALE = 13107;
  private static readonly PAN_INC = 4;
  private static readonly ZOOM_IN = 66846;
  private static readonly ZOOM_OUT = 64250;
  private static readonly INT_MAX = 0x7fffffff;

  active = false;
  cheating = 0;
  grid = 0;
  followPlayer = 1;
  private stopped = true;
  private lastLevel = -1;
  private lastEpisode = -1;
  private bigState = 0;
  private clock = 0;
  private fW = SCREENWIDTH;
  private fH = SCREENHEIGHT - SBARHEIGHT;
  private mX = 0;
  private mY = 0;
  private mX2 = 0;
  private mY2 = 0;
  private mW = 0;
  private mH = 0;
  private minX = 0;
  private minY = 0;
  private maxX = 0;
  private maxY = 0;
  private minScale = FRACUNIT;
  private maxScale = FRACUNIT;
  private scaleMtof = AmMap.INIT_SCALE;
  private scaleFtom = FRACUNIT;
  private oldMX = 0;
  private oldMY = 0;
  private oldMW = 0;
  private oldMH = 0;
  private oldFollowX = AmMap.INT_MAX;
  private oldFollowY = 0;
  private panX = 0;
  private panY = 0;
  private zoomMtof = FRACUNIT;
  private zoomFtom = FRACUNIT;
  private playerArrow: Shape;
  private thingTriangle: Shape;
  private markNumbers: Array<Buffer | null> = [];
  private marks: Array<[number, number]> = [];
  private markNumber = 0;

  constructor() {
    const radius = intdiv(8 * PLAYER_RADIUS, 7);
    const q = intdiv(radius, 4);
    const e = intdiv(radius, 8);
    this.playerArrow = [
      [-radius + e, 0, radius, 0],
      [radius, 0, radius - intdiv(radius, 2), q],
      [radius, 0, radius - intdiv(radius, 2), -q],
      [-radius + e, 0, -radius - e, q],
      [-radius + e, 0, -radius - e, -q],
      [-radius + 3 * e, 0, -radius + e, q],
      [-radius + 3 * e, 0, -radius + e, -q],
    ];
    this.thingTriangle = [
      [-intdiv(FRACUNIT, 2), -intdiv(7 * FRACUNIT, 10), FRACUNIT, 0],
      [FRACUNIT, 0, -intdiv(FRACUNIT, 2), intdiv(7 * FRACUNIT, 10)],
      [-intdiv(FRACUNIT, 2), intdiv(7 * FRACUNIT, 10), -intdiv(FRACUNIT, 2), -intdiv(7 * FRACUNIT, 10)],
    ];
    this.clearMarks();
  }

  start(game: Game): void {
    if (!this.stopped) this.stop();
    this.stopped = false;
    if (this.lastLevel !== game.mapn || this.lastEpisode !== game.episode) {
      this.levelInit(game);
      this.lastLevel = game.mapn;
      this.lastEpisode = game.episode;
    }
    this.initVariables(game);
    for (let i = 0; i < 10; ++i) {
      const n = game.wad.checkNumForName(`AMMNUM${i}`);
      this.markNumbers[i] = n >= 0 ? game.wad.cacheLumpNum(n) : null;
    }
    this.active = true;
  }

  stop(): void {
    this.active = false;
    this.stopped = true;
    this.panX = this.panY = 0;
    this.zoomMtof = this.zoomFtom = FRACUNIT;
    this.bigState = 0;
  }

  resetLevel(): void {
    this.stop();
    this.lastLevel = this.lastEpisode = -1;
    this.cheating = 0;
  }

  ticker(game: Game): void {
    if (!this.active) return;
    ++this.clock;
    if (this.followPlayer) this.follow(game);
    if (this.zoomFtom !== FRACUNIT) this.changeScale();
    if (this.panX !== 0 || this.panY !== 0) this.changeLocation();
  }

  draw(fb: Uint8Array, game: Game): void {
    if (!this.active) return;
    const limit = this.fW * this.fH;
    for (let i = 0; i < limit; ++i) fb[i] = 0;
    if (this.grid) this.drawGrid(fb, game);
    this.drawWalls(fb, game);
    const mo = game.player!.mo!;
    this.drawCharacter(fb, this.playerArrow, 0, mo.angle, AmMap.WHITE, mo.x, mo.y);
    if (this.cheating === 2) {
      for (const thing of game.world!.mobjs) {
        this.drawCharacter(fb, this.thingTriangle, 16 * FRACUNIT, thing.angle, AmMap.GREENS, thing.x, thing.y);
      }
    }
    this.put(fb, intdiv(this.fW, 2), intdiv(this.fH, 2), AmMap.GRAYS);
    for (let i = 0; i < this.marks.length; ++i) {
      const [mx, my] = this.marks[i]!;
      if (mx === -1 || (this.markNumbers[i] ?? null) === null) continue;
      const x = this.cx(mx);
      const y = this.cy(my);
      if (x >= 0 && x <= this.fW - 5 && y >= 0 && y <= this.fH - 6) {
        drawPatch(fb, x, y, this.markNumbers[i]!);
      }
    }
  }

  responder(type: string, key: number, game: Game): boolean {
    if (game.gamestate !== GS_LEVEL || game.player === null || game.world === null) return false;
    if (type === "keydown") {
      if (!this.active) {
        if (key === TAB) {
          this.start(game);
          return true;
        }
        return false;
      }
      if ([LEFT, RIGHT].includes(key) && !this.followPlayer) {
        this.panX = (key === RIGHT ? 1 : -1) * this.ftom(AmMap.PAN_INC);
        return true;
      }
      if ([UP, DOWN].includes(key) && !this.followPlayer) {
        this.panY = (key === UP ? 1 : -1) * this.ftom(AmMap.PAN_INC);
        return true;
      }
      if (isMinus(key)) {
        this.zoomMtof = AmMap.ZOOM_OUT;
        this.zoomFtom = AmMap.ZOOM_IN;
        return true;
      }
      if (isPlus(key)) {
        this.zoomMtof = AmMap.ZOOM_IN;
        this.zoomFtom = AmMap.ZOOM_OUT;
        return true;
      }
      if (key === TAB) {
        this.stop();
        return true;
      }
      if (key === "0".charCodeAt(0)) {
        this.bigState ^= 1;
        if (this.bigState) {
          this.saveScale();
          this.minOut();
        } else {
          this.restoreScale(game);
        }
        return true;
      }
      if (key === "f".charCodeAt(0)) {
        this.followPlayer ^= 1;
        this.oldFollowX = AmMap.INT_MAX;
        game.player.setMessage(this.followPlayer ? "Follow Mode ON" : "Follow Mode OFF");
        return true;
      }
      if (key === "g".charCodeAt(0)) {
        this.grid ^= 1;
        game.player.setMessage(this.grid ? "Grid ON" : "Grid OFF");
        return true;
      }
      if (key === "m".charCodeAt(0)) {
        game.player.setMessage(`Marked Spot ${this.markNumber}`);
        this.marks[this.markNumber] = [this.mX + intdiv(this.mW, 2), this.mY + intdiv(this.mH, 2)];
        this.markNumber = (this.markNumber + 1) % 10;
        return true;
      }
      if (key === "c".charCodeAt(0)) {
        this.clearMarks();
        game.player.setMessage("All Marks Cleared");
        return true;
      }
    } else if (type === "keyup" && this.active) {
      if ([LEFT, RIGHT].includes(key) && !this.followPlayer) this.panX = 0;
      else if ([UP, DOWN].includes(key) && !this.followPlayer) this.panY = 0;
      else if (isMinus(key) || isPlus(key)) this.zoomMtof = this.zoomFtom = FRACUNIT;
    }
    return false;
  }

  cycleIddt(): void {
    this.cheating = (this.cheating + 1) % 3;
  }

  private levelInit(game: Game): void {
    this.clearMarks();
    this.minX = this.minY = AmMap.INT_MAX;
    this.maxX = this.maxY = -AmMap.INT_MAX;
    for (const vertex of game.world!.vertexes) {
      this.minX = Math.min(this.minX, vertex.x);
      this.maxX = Math.max(this.maxX, vertex.x);
      this.minY = Math.min(this.minY, vertex.y);
      this.maxY = Math.max(this.maxY, vertex.y);
    }
    const width = Math.max(FRACUNIT, this.maxX - this.minX);
    const height = Math.max(FRACUNIT, this.maxY - this.minY);
    this.minScale = Math.min(
      fixedDiv(this.fW * FRACUNIT, width),
      fixedDiv(this.fH * FRACUNIT, height),
    );
    this.maxScale = fixedDiv(this.fH * FRACUNIT, 2 * PLAYER_RADIUS);
    this.scaleMtof = fixedDiv(this.minScale, Math.trunc(0.7 * FRACUNIT));
    if (this.scaleMtof > this.maxScale) this.scaleMtof = this.minScale;
    this.scaleFtom = fixedDiv(FRACUNIT, this.scaleMtof);
  }

  private initVariables(game: Game): void {
    this.oldFollowX = AmMap.INT_MAX;
    this.clock = this.panX = this.panY = 0;
    this.zoomMtof = this.zoomFtom = FRACUNIT;
    this.mW = this.ftom(this.fW);
    this.mH = this.ftom(this.fH);
    const mo = game.player!.mo!;
    this.mX = mo.x - intdiv(this.mW, 2);
    this.mY = mo.y - intdiv(this.mH, 2);
    this.changeLocation();
    this.saveScale();
  }

  private clearMarks(): void {
    this.marks = Array.from({ length: 10 }, () => [-1, -1] as [number, number]);
    this.markNumbers = new Array(10).fill(null);
    this.markNumber = 0;
  }

  private ftom(pixels: number): number {
    return fixedMul(pixels * FRACUNIT, this.scaleFtom);
  }

  private mtof(map: number): number {
    return shar(fixedMul(map, this.scaleMtof), 16);
  }

  private cx(x: number): number {
    return this.mtof(x - this.mX);
  }

  private cy(y: number): number {
    return this.fH - this.mtof(y - this.mY);
  }

  private saveScale(): void {
    this.oldMX = this.mX;
    this.oldMY = this.mY;
    this.oldMW = this.mW;
    this.oldMH = this.mH;
  }

  private activateScale(): void {
    const cx = this.mX + intdiv(this.mW, 2);
    const cy = this.mY + intdiv(this.mH, 2);
    this.mW = this.ftom(this.fW);
    this.mH = this.ftom(this.fH);
    this.mX = cx - intdiv(this.mW, 2);
    this.mY = cy - intdiv(this.mH, 2);
    this.mX2 = this.mX + this.mW;
    this.mY2 = this.mY + this.mH;
  }

  private minOut(): void {
    this.scaleMtof = this.minScale;
    this.scaleFtom = fixedDiv(FRACUNIT, this.scaleMtof);
    this.activateScale();
  }

  private restoreScale(game: Game): void {
    this.mW = this.oldMW;
    this.mH = this.oldMH;
    if (this.followPlayer) {
      this.mX = game.player!.mo!.x - intdiv(this.mW, 2);
      this.mY = game.player!.mo!.y - intdiv(this.mH, 2);
    } else {
      this.mX = this.oldMX;
      this.mY = this.oldMY;
    }
    this.mX2 = this.mX + this.mW;
    this.mY2 = this.mY + this.mH;
    this.scaleMtof = fixedDiv(this.fW * FRACUNIT, this.mW);
    this.scaleFtom = fixedDiv(FRACUNIT, this.scaleMtof);
  }

  private changeScale(): void {
    this.scaleMtof = fixedMul(this.scaleMtof, this.zoomMtof);
    this.scaleFtom = fixedDiv(FRACUNIT, this.scaleMtof);
    if (this.scaleMtof < this.minScale) {
      this.minOut();
    } else if (this.scaleMtof > this.maxScale) {
      this.scaleMtof = this.maxScale;
      this.scaleFtom = fixedDiv(FRACUNIT, this.scaleMtof);
      this.activateScale();
    } else {
      this.activateScale();
    }
  }

  private changeLocation(): void {
    if (this.panX !== 0 || this.panY !== 0) {
      this.followPlayer = 0;
      this.oldFollowX = AmMap.INT_MAX;
    }
    this.mX += this.panX;
    this.mY += this.panY;
    this.mX = Math.min(this.maxX - intdiv(this.mW, 2), Math.max(this.minX - intdiv(this.mW, 2), this.mX));
    this.mY = Math.min(this.maxY - intdiv(this.mH, 2), Math.max(this.minY - intdiv(this.mH, 2), this.mY));
    this.mX2 = this.mX + this.mW;
    this.mY2 = this.mY + this.mH;
  }

  private follow(game: Game): void {
    const mo = game.player!.mo!;
    if (this.oldFollowX !== mo.x || this.oldFollowY !== mo.y) {
      this.mX = this.ftom(this.mtof(mo.x)) - intdiv(this.mW, 2);
      this.mY = this.ftom(this.mtof(mo.y)) - intdiv(this.mH, 2);
      this.mX2 = this.mX + this.mW;
      this.mY2 = this.mY + this.mH;
      this.oldFollowX = mo.x;
      this.oldFollowY = mo.y;
    }
  }

  private drawGrid(fb: Uint8Array, game: Game): void {
    const block = 128 * FRACUNIT;
    let start = this.mX + ((block - ((this.mX - game.world!.bmaporgx) % block)) % block);
    for (let x = start; x < this.mX + this.mW; x += block) {
      this.line(fb, x, this.mY, x, this.mY + this.mH, AmMap.GRID_COLOR);
    }
    start = this.mY + ((block - ((this.mY - game.world!.bmaporgy) % block)) % block);
    for (let y = start; y < this.mY + this.mH; y += block) {
      this.line(fb, this.mX, y, this.mX + this.mW, y, AmMap.GRID_COLOR);
    }
  }

  private drawWalls(fb: Uint8Array, game: Game): void {
    for (const line of game.world!.lines) {
      if (!this.cheating && ((line.flags & ML_MAPPED) === 0 || (line.flags & ML_DONTDRAW) !== 0)) {
        continue;
      }
      let color: number | null = null;
      if (line.backsector === null) {
        color = AmMap.REDS;
      } else if (line.frontsector !== null) {
        if (line.special === 39) color = AmMap.REDS + intdiv(AmMap.RED_RANGE, 2);
        else if ((line.flags & ML_SECRET) !== 0) color = AmMap.REDS;
        else if (line.backsector.floorheight !== line.frontsector.floorheight) color = AmMap.BROWNS;
        else if (line.backsector.ceilingheight !== line.frontsector.ceilingheight) color = AmMap.YELLOWS;
        else if (this.cheating) color = AmMap.GRAYS;
      }
      if (color !== null) this.line(fb, line.v1!.x, line.v1!.y, line.v2!.x, line.v2!.y, color);
    }
  }

  private drawCharacter(
    fb: Uint8Array,
    shape: Shape,
    scale: number,
    angle: number,
    color: number,
    x: number,
    y: number,
  ): void {
    for (const seg of shape) {
      let [ax, ay, bx, by] = seg;
      if (scale !== 0) {
        ax = fixedMul(scale, ax);
        ay = fixedMul(scale, ay);
        bx = fixedMul(scale, bx);
        by = fixedMul(scale, by);
      }
      if (angle !== 0) {
        [ax, ay] = this.rotate(ax, ay, angle);
        [bx, by] = this.rotate(bx, by, angle);
      }
      this.line(fb, ax + x, ay + y, bx + x, by + y, color);
    }
  }

  private rotate(x: number, y: number, angle: number): [number, number] {
    const cos = fineCos(angle);
    const sin = fineSin(angle);
    return [fixedMul(x, cos) - fixedMul(y, sin), fixedMul(x, sin) + fixedMul(y, cos)];
  }

  private line(fb: Uint8Array, ax: number, ay: number, bx: number, by: number, color: number): void {
    const seg = { x0: this.cx(ax), y0: this.cy(ay), x1: this.cx(bx), y1: this.cy(by) };
    if (!this.clip(seg)) return;
    let { x0, y0 } = seg;
    const { x1, y1 } = seg;
    const dx = Math.abs(x1 - x0);
    const sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0);
    const sy = y0 < y1 ? 1 : -1;
    let error = dx + dy;
    while (true) {
      this.put(fb, x0, y0, color);
      if (x0 === x1 && y0 === y1) break;
      const twice = 2 * error;
      if (twice >= dy) {
        error += dy;
        x0 += sx;
      }
      if (twice <= dx) {
        error += dx;
        y0 += sy;
      }
    }
  }

  private clip(seg: { x0: number; y0: number; x1: number; y1: number }): boolean {
    const code = (x: number, y: number): number =>
      (x < 0 ? 1 : x >= SCREENWIDTH ? 2 : 0) | (y < 0 ? 8 : y >= SCREENHEIGHT - SBARHEIGHT ? 4 : 0);
    for (let i = 0; i < 8; ++i) {
      const a = code(seg.x0, seg.y0);
      const b = code(seg.x1, seg.y1);
      if ((a | b) === 0) return true;
      if ((a & b) !== 0) return false;
      const out = a || b;
      let x: number;
      let y: number;
      if (out & 8) {
        x = seg.x0 + intdiv((seg.x1 - seg.x0) * -seg.y0, (seg.y1 - seg.y0) || 1);
        y = 0;
      } else if (out & 4) {
        y = this.fH - 1;
        x = seg.x0 + intdiv((seg.x1 - seg.x0) * (y - seg.y0), (seg.y1 - seg.y0) || 1);
      } else if (out & 2) {
        x = this.fW - 1;
        y = seg.y0 + intdiv((seg.y1 - seg.y0) * (x - seg.x0), (seg.x1 - seg.x0) || 1);
      } else {
        x = 0;
        y = seg.y0 + intdiv((seg.y1 - seg.y0) * -seg.x0, (seg.x1 - seg.x0) || 1);
      }
      if (out === a) {
        seg.x0 = x;
        seg.y0 = y;
      } else {
        seg.x1 = x;
        seg.y1 = y;
      }
    }
    return false;
  }

  private put(fb: Uint8Array, x: number, y: number, color: number): void {
    if (x >= 0 && x < this.fW && y >= 0 && y < this.fH) {
      fb[y * this.fW + x] = color & 0xff;
    }
  }
}

export const Automap = AmMap;

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
import { TICRATE } from "./defs.ts";
import type { Game } from "./game.ts";
import { KP_ENTER, LCTRL, RCTRL, RETURN, SPACE } from "./keys.ts";
import { drawPatch, patchSize } from "./vvideo.ts";

export class WbStart {
  constructor(
    public epsd: number,
    public last: number,
    public next: number,
    public maxkills: number,
    public maxitems: number,
    public maxsecret: number,
    public partime: number,
    public skills: number,
    public sitems: number,
    public ssecret: number,
    public stime: number,
    public didsecret: boolean,
    public commercial: boolean,
  ) {}
}

export class WiAnim {
  constructor(
    public type: number,
    public period: number,
    public frames: number,
    public x: number,
    public y: number,
    public data: number,
    public patches: Array<Buffer | null>,
    public current = -1,
    public nextTic = 0,
  ) {}
}

function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

export class Intermission {
  static readonly NO_STATE = -1;
  static readonly STAT_COUNT = 0;
  static readonly SHOW_NEXT = 1;
  private static readonly ALWAYS = 0;
  private static readonly LEVEL = 2;
  private static readonly PARS = [
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 30, 75, 120, 90, 165, 180, 180, 30, 165],
    [0, 90, 90, 90, 120, 90, 360, 240, 30, 170],
    [0, 90, 45, 90, 150, 90, 90, 165, 30, 135],
  ];
  private static readonly CPARS = [
    30, 90, 120, 120, 90, 150, 120, 120, 270, 90, 210, 150, 150, 150, 210, 150, 420, 150, 210, 150,
    240, 150, 180, 150, 150, 300, 330, 420, 300, 180, 120, 30,
  ];
  private static readonly NODES = [
    [[185, 164], [148, 143], [69, 122], [209, 102], [116, 89], [166, 55], [71, 56], [135, 29], [71, 24]],
    [[254, 25], [97, 50], [188, 64], [128, 78], [214, 92], [133, 130], [208, 136], [148, 140], [235, 158]],
    [[156, 168], [48, 154], [174, 95], [265, 75], [130, 48], [279, 23], [198, 48], [140, 25], [281, 136]],
  ];
  private static readonly ANIMS: number[][][] = [
    [[0, 11, 3, 224, 104, 0], [0, 11, 3, 184, 160, 0], [0, 11, 3, 112, 136, 0], [0, 11, 3, 72, 112, 0], [0, 11, 3, 88, 96, 0], [0, 11, 3, 64, 48, 0], [0, 11, 3, 192, 40, 0], [0, 11, 3, 136, 16, 0], [0, 11, 3, 80, 16, 0], [0, 11, 3, 64, 24, 0]],
    [[2, 11, 1, 128, 136, 1], [2, 11, 1, 128, 136, 2], [2, 11, 1, 128, 136, 3], [2, 11, 1, 128, 136, 4], [2, 11, 1, 128, 136, 5], [2, 11, 1, 128, 136, 6], [2, 11, 1, 128, 136, 7], [0, 11, 3, 192, 144, 8], [2, 11, 1, 128, 136, 8]],
    [[0, 11, 3, 104, 168, 0], [0, 11, 3, 40, 136, 0], [0, 11, 3, 160, 96, 0], [0, 11, 3, 104, 80, 0], [0, 11, 3, 120, 32, 0], [0, 8, 3, 40, 0, 0]],
  ];

  private game: Game;
  private wbs: WbStart;
  private state = Intermission.STAT_COUNT;
  private accelerate = 0;
  private spState = 1;
  private kills = -1;
  private items = -1;
  private secret = -1;
  private time = -1;
  private par = -1;
  private pause = TICRATE;
  private count = 0;
  private backgroundCount = 0;
  private pointer = false;
  done = false;
  private patches: Record<string, Buffer | null> = {};
  private numbers: Array<Buffer | null> = [];
  private levelNames: Array<Buffer | null> = [];
  private animations: WiAnim[] = [];
  private background: Buffer | null;

  constructor(game: Game, wbs: WbStart) {
    this.game = game;
    this.wbs = wbs;
    const names: Record<string, string> = {
      finished: "WIF", entering: "WIENTER", kills: "WIOSTK", items: "WIOSTI",
      secret: "WISCRT2", percent: "WIPCNT", colon: "WICOLON", time: "WITIME",
      par: "WIPAR", sucks: "WISUCKS", minus: "WIMINUS", splat: "WISPLAT",
      yah0: "WIURH0", yah1: "WIURH1",
    };
    for (const key of Object.keys(names)) this.patches[key] = this.lump(names[key]!);
    for (let i = 0; i < 10; ++i) this.numbers.push(this.lump(`WINUM${i}`));
    this.background =
      this.lump(wbs.commercial || wbs.epsd === 3 ? "INTERPIC" : `WIMAP${wbs.epsd}`) ??
      this.lump("INTERPIC");
    const maps = wbs.commercial ? 32 : 9;
    for (let i = 0; i < maps; ++i) {
      this.levelNames.push(
        this.lump(wbs.commercial ? `CWILV${String(i).padStart(2, "0")}` : `WILV${wbs.epsd}${i}`),
      );
    }
    if (!wbs.commercial && wbs.epsd < 3) {
      const anims = Intermission.ANIMS[wbs.epsd]!;
      for (let j = 0; j < anims.length; ++j) {
        const [type, period, frames, x, y, data] = anims[j]! as [number, number, number, number, number, number];
        const images: Array<Buffer | null> = [];
        for (let i = 0; i < frames; ++i) {
          images.push(
            wbs.epsd === 1 && j === 8
              ? this.animations[4]?.patches[i] ?? null
              : this.lump(`WIA${wbs.epsd}${String(j).padStart(2, "0")}${String(i).padStart(2, "0")}`),
          );
        }
        this.animations.push(new WiAnim(type, period, frames, x, y, data, images));
      }
    }
    this.initAnimated();
  }

  static parTime(episode: number, map: number, commercial: boolean): number {
    if (commercial) return TICRATE * Intermission.CPARS[Math.max(0, Math.min(Intermission.CPARS.length - 1, map - 1))]!;
    if (episode >= 1 && episode <= 3 && map >= 1 && map <= 9) return TICRATE * Intermission.PARS[episode]![map]!;
    return TICRATE * 30;
  }

  ticker(): void {
    ++this.backgroundCount;
    if (this.backgroundCount === 1) {
      this.game.sound.changeMusic(this.wbs.commercial ? "dm2int" : "inter", true);
    }
    this.checkAccelerate();
    if (this.state === Intermission.STAT_COUNT) this.updateStats();
    else if (this.state === Intermission.SHOW_NEXT) this.updateShowNext();
    else this.updateNoState();
  }

  private checkAccelerate(): void {
    if (this.game.menu?.active) return;
    const keys = this.game.keys;
    const attack = !!keys[LCTRL] || !!keys[RCTRL];
    const use =
      !!keys[SPACE] || !!keys["e".charCodeAt(0)] || !!keys[RETURN] || !!keys[KP_ENTER];
    const player = this.game.player;
    if (player === null) {
      if (attack || use) this.accelerate = 1;
      return;
    }
    if (attack && !player.attackdown) this.accelerate = 1;
    if (use && !player.usedown) this.accelerate = 1;
    player.attackdown = attack;
    player.usedown = use;
  }

  private updateStats(): void {
    this.updateAnimated();
    const w = this.wbs;
    if (this.accelerate && this.spState !== 10) {
      this.accelerate = 0;
      this.kills = Intermission.pct(w.skills, w.maxkills);
      this.items = Intermission.pct(w.sitems, w.maxitems);
      this.secret = Intermission.pct(w.ssecret, w.maxsecret);
      this.time = intdiv(w.stime, TICRATE);
      this.par = intdiv(w.partime, TICRATE);
      this.game.startSound("barexp");
      this.spState = 10;
      return;
    }
    if ((this.spState & 1) !== 0) {
      if (--this.pause === 0) {
        ++this.spState;
        this.pause = TICRATE;
        switch (this.spState) {
          case 2: this.kills = 0; break;
          case 4: this.items = 0; break;
          case 6: this.secret = 0; break;
          case 8: this.time = this.par = 0; break;
        }
      }
      return;
    }
    if (this.spState === 10) {
      if (this.accelerate) {
        this.game.startSound("wpnup");
        if (w.commercial) this.initNoState();
        else this.initShowNext();
      }
      return;
    }
    const field = this.spState === 2 ? "kills" : this.spState === 4 ? "items" : this.spState === 6 ? "secret" : "time";
    if ((this.backgroundCount & 3) === 0) this.game.startSound("pistol");
    if (field === "time") {
      this.time += 3;
      this.par += 3;
      this.time = Math.min(this.time, intdiv(w.stime, 35));
      this.par = Math.min(this.par, intdiv(w.partime, 35));
      if (this.time >= intdiv(w.stime, 35) && this.par >= intdiv(w.partime, 35)) this.finishCount();
    } else {
      const src = field === "secret" ? w.ssecret : field === "items" ? w.sitems : w.skills;
      const max = field === "secret" ? w.maxsecret : field === "items" ? w.maxitems : w.maxkills;
      const target = Intermission.pct(src, max);
      const cur = (this as unknown as Record<string, number>)[field]! + 2;
      if (cur >= target) {
        (this as unknown as Record<string, number>)[field] = target;
        this.finishCount();
      } else {
        (this as unknown as Record<string, number>)[field] = cur;
      }
    }
  }

  private finishCount(): void {
    this.game.startSound("barexp");
    ++this.spState;
  }

  private static pct(value: number, max: number): number {
    return intdiv(value * 100, Math.max(1, max));
  }

  private initShowNext(): void {
    this.state = Intermission.SHOW_NEXT;
    this.accelerate = 0;
    this.count = 4 * 35;
    this.initAnimated();
  }

  private initNoState(): void {
    this.state = Intermission.NO_STATE;
    this.accelerate = 0;
    this.count = 10;
  }

  private updateShowNext(): void {
    this.updateAnimated();
    if (--this.count === 0 || this.accelerate) this.initNoState();
    else this.pointer = (this.count & 31) < 20;
  }

  private updateNoState(): void {
    this.updateAnimated();
    if (--this.count === 0) this.done = true;
  }

  private initAnimated(): void {
    for (const animation of this.animations) {
      animation.current = -1;
      animation.nextTic =
        this.backgroundCount +
        1 +
        (animation.type === Intermission.ALWAYS ? randomInt(0, Math.max(0, animation.period - 1)) : 0);
    }
  }

  private updateAnimated(): void {
    for (let i = 0; i < this.animations.length; ++i) {
      const a = this.animations[i]!;
      if (this.backgroundCount === a.nextTic) {
        if (a.type === Intermission.ALWAYS) {
          a.current = (a.current + 1) % a.frames;
          a.nextTic = this.backgroundCount + a.period;
        } else if (!(this.state === Intermission.STAT_COUNT && i === 7) && this.wbs.next === a.data) {
          a.current = Math.min(a.frames - 1, a.current + 1);
          a.nextTic = this.backgroundCount + a.period;
        }
      }
    }
  }

  draw(fb: Uint8Array): void {
    this.drawBackground(fb);
    if (this.state === Intermission.STAT_COUNT) this.drawStats(fb);
    else this.drawNext(fb);
  }

  private drawBackground(fb: Uint8Array): void {
    if (this.background !== null) drawPatch(fb, 0, 0, this.background);
    for (const a of this.animations) {
      if (a.current >= 0 && (a.patches[a.current] ?? null) !== null) {
        drawPatch(fb, a.x, a.y, a.patches[a.current]!);
      }
    }
  }

  private drawStats(fb: Uint8Array): void {
    this.drawFinished(fb);
    const line = 24;
    const rows: Array<[string, number, number]> = [
      ["kills", this.kills, 50],
      ["items", this.items, 50 + line],
      ["secret", this.secret, 50 + 2 * line],
    ];
    for (const [name, value, y] of rows) {
      if (this.patches[name] != null) drawPatch(fb, 50, y, this.patches[name]!);
      this.drawPercent(fb, 270, y, value);
    }
    if (this.patches["time"] != null) drawPatch(fb, 16, 168, this.patches["time"]!);
    this.drawTime(fb, 144, 168, this.time);
    if (this.wbs.epsd < 3) {
      if (this.patches["par"] != null) drawPatch(fb, 176, 168, this.patches["par"]!);
      this.drawTime(fb, 304, 168, this.par);
    }
  }

  private drawFinished(fb: Uint8Array): void {
    let y = 2;
    const name = this.levelNames[this.wbs.last] ?? null;
    if (name !== null) {
      const [w, h] = patchSize(name);
      drawPatch(fb, intdiv(320 - w, 2), y, name);
      y += intdiv(5 * h, 4);
    }
    if (this.patches["finished"] != null) {
      const [w] = patchSize(this.patches["finished"]!);
      drawPatch(fb, intdiv(320 - w, 2), y, this.patches["finished"]!);
    }
  }

  private drawNext(fb: Uint8Array): void {
    if (this.state === Intermission.NO_STATE) this.pointer = true;
    if (!this.wbs.commercial && this.wbs.epsd < 3) {
      const last = this.wbs.last === 8 ? this.wbs.next - 1 : this.wbs.last;
      for (let i = 0; i <= last; ++i) this.drawNode(fb, i, [this.patches["splat"]!]);
      if (this.wbs.didsecret) this.drawNode(fb, 8, [this.patches["splat"]!]);
      if (this.pointer) this.drawNode(fb, this.wbs.next, [this.patches["yah0"]!, this.patches["yah1"]!]);
    }
    if (!this.wbs.commercial || this.wbs.next !== 30) this.drawEntering(fb);
  }

  private drawEntering(fb: Uint8Array): void {
    let y = 2;
    const p = this.patches["entering"];
    if (p != null) {
      const [w, h] = patchSize(p);
      drawPatch(fb, intdiv(320 - w, 2), y, p);
      y += intdiv(5 * h, 4);
    }
    const p2 = this.levelNames[this.wbs.next] ?? null;
    if (p2 !== null) {
      const [w] = patchSize(p2);
      drawPatch(fb, intdiv(320 - w, 2), y, p2);
    }
  }

  private drawNode(fb: Uint8Array, number: number, patches: Array<Buffer | null>): void {
    const node = Intermission.NODES[this.wbs.epsd]?.[number] ?? null;
    if (node === null) return;
    for (const p of patches) {
      if (p != null) {
        const [w, h, left, top] = patchSize(p);
        if (
          node[0]! - left >= 0 &&
          node[0]! - left + w < 320 &&
          node[1]! - top >= 0 &&
          node[1]! - top + h < 200
        ) {
          drawPatch(fb, node[0]!, node[1]!, p);
          return;
        }
      }
    }
  }

  private drawPercent(fb: Uint8Array, x: number, y: number, value: number): void {
    if (value < 0) return;
    if (this.patches["percent"] != null) drawPatch(fb, x, y, this.patches["percent"]!);
    this.drawNumber(fb, x, y, value, -1);
  }

  private drawNumber(fb: Uint8Array, x: number, y: number, n: number, digits: number): number {
    const width = this.numbers[0] != null ? patchSize(this.numbers[0]!)[0] : 8;
    if (digits < 0) digits = n === 0 ? 1 : String(Math.abs(n)).length;
    const negative = n < 0;
    n = Math.abs(n);
    while (digits-- > 0) {
      x -= width;
      const p = this.numbers[n % 10];
      if (p != null) drawPatch(fb, x, y, p);
      n = intdiv(n, 10);
    }
    if (negative && this.patches["minus"] != null) {
      x -= 8;
      drawPatch(fb, x, y, this.patches["minus"]!);
    }
    return x;
  }

  private drawTime(fb: Uint8Array, x: number, y: number, t: number): void {
    if (t < 0) return;
    if (t > 61 * 59) {
      const p = this.patches["sucks"];
      if (p != null) {
        const [w] = patchSize(p);
        drawPatch(fb, x - w, y, p);
      }
      return;
    }
    let div = 1;
    do {
      const n = intdiv(t, div) % 60;
      x = this.drawNumber(fb, x, y, n, 2) - 8;
      div *= 60;
      if ((div === 60 || intdiv(t, div) > 0) && this.patches["colon"] != null) {
        drawPatch(fb, x, y, this.patches["colon"]!);
      }
    } while (intdiv(t, div) > 0);
  }

  private lump(name: string): Buffer | null {
    const n = this.game.wad.checkNumForName(name);
    return n < 0 ? null : this.game.wad.cacheLumpNum(n);
  }
}

export const WiStuff = Intermission;

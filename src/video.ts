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

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import koffi from "koffi";
import { SCREENHEIGHT, SCREENWIDTH } from "./defs.ts";
import { EQUALS, KP_MINUS, KP_PLUS, MINUS, PLUS } from "./keys.ts";

const SDL_INIT_AUDIO = 0x00000010;
const SDL_INIT_VIDEO = 0x00000020;
const SDL_INIT_EVENTS = 0x00004000;
const SDL_WINDOWPOS_CENTERED = 0x2fff0000;
const SDL_WINDOW_SHOWN = 0x00000004;
const SDL_WINDOW_RESIZABLE = 0x00000020;
const SDL_WINDOW_FULLSCREEN_DESKTOP = 0x00001001;
const SDL_RENDERER_ACCELERATED = 0x00000002;
const SDL_RENDERER_PRESENTVSYNC = 0x00000004;
const SDL_PIXELFORMAT_ARGB8888 = 0x16362004;

function colorDist2(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return dr * dr + dg * dg + db * db;
}

function colorLum(r: number, g: number, b: number): number {
  return r * 3 + g * 6 + b;
}

function colorSat(r: number, g: number, b: number): number {
  return Math.max(r, g, b) - Math.min(r, g, b);
}

/** 0 cinza, 1 marrom, 2 oliva, 3 azul. -1 fica no bloco cromatico. */
function toneBin(r: number, g: number, b: number): number {
  const sat = colorSat(r, g, b);
  if (sat <= 28) return 0;
  if (r > g + 28 && r > b + 28 && g * 2 < r) return -1;
  if (g > r + 28 && g > b + 28 && sat > 64) return -1;
  if (b > r + 24 && b > g + 16 && sat > 56) return -1;
  if (b >= r && b >= g) return 3;
  if (g + 6 >= r && g >= b) return 2;
  if (r >= b && g + 8 >= b) return 1;
  return -1;
}

function addFarthest(
  src: Array<[number, number, number]>,
  pal: Array<[number, number, number]>,
  nChosen: number,
  nWant: number,
  nMaxLum: number,
  chromaOnly: boolean,
): number {
  while (nChosen < nWant) {
    let bestI = -1;
    let bestD = -1;
    for (let i = 1; i < 256; i++) {
      const [r, g, b] = src[i]!;
      if (nMaxLum >= 0 && colorLum(r, g, b) > nMaxLum) continue;
      if (chromaOnly && toneBin(r, g, b) >= 0) continue;
      let minD = 0x7fffffff;
      for (let k = 0; k < nChosen; k++) {
        const [pr, pg, pb] = pal[k]!;
        const d = colorDist2(r, g, b, pr, pg, pb);
        if (d < minD) minD = d;
      }
      if (minD > bestD) {
        bestD = minD;
        bestI = i;
      }
    }
    if (bestI < 0 || bestD <= 0) break;
    pal[nChosen] = [src[bestI]![0], src[bestI]![1], src[bestI]![2]];
    nChosen++;
  }
  return nChosen;
}

function addToneRamp(
  src: Array<[number, number, number]>,
  pal: Array<[number, number, number]>,
  nChosen: number,
  nStop: number,
  bin: number,
): number {
  while (nChosen < nStop) {
    let bestI = -1;
    let bestD = -1;
    for (let i = 1; i < 256; i++) {
      const [r, g, b] = src[i]!;
      if (toneBin(r, g, b) !== bin) continue;
      const lumI = colorLum(r, g, b);
      let minD = 0x7fffffff;
      for (let k = 0; k < nChosen; k++) {
        const [pr, pg, pb] = pal[k]!;
        let dl = lumI - colorLum(pr, pg, pb);
        if (dl < 0) dl = -dl;
        const d = dl * dl + Math.trunc(colorDist2(r, g, b, pr, pg, pb) / 64);
        if (d < minD) minD = d;
      }
      if (minD > bestD) {
        bestD = minD;
        bestI = i;
      }
    }
    if (bestI < 0 || bestD <= 400) break;
    pal[nChosen] = [src[bestI]![0], src[bestI]![1], src[bestI]![2]];
    nChosen++;
  }
  return nChosen;
}

/** Mesma reducao do Harbour: indice 0 reservado, rampas de luz e puxao para o cinza. */
function quantizeColors(
  src: Array<[number, number, number]>,
  nWant: number,
  shadePct: number,
  grayPct: number,
): Array<[number, number, number]> {
  if (nWant < 2) nWant = 2;
  if (nWant >= 256) return src;
  const pal: Array<[number, number, number]> = new Array(256);
  pal[0] = [src[0]![0], src[0]![1], src[0]![2]];
  let nChosen = 1;
  const nFree = nWant - 1;
  let nShade = Math.trunc((nFree * shadePct) / 100);
  if (nShade > nFree) nShade = nFree;
  if (nShade < 0) nShade = 0;
  if (nShade > 0) {
    const quota = [0, 0, 0, 0];
    let left = nShade;
    if (nShade >= 4) {
      quota[0] = quota[1] = quota[2] = quota[3] = 1;
      left = nShade - 4;
    }
    quota[0]! += Math.trunc((left * 45) / 100);
    quota[1]! += Math.trunc((left * 40) / 100);
    quota[2]! += Math.trunc((left * 5) / 100);
    quota[3]! += Math.trunc((left * 10) / 100);
    const used = quota[0]! + quota[1]! + quota[2]! + quota[3]!;
    quota[0]! += nShade - used;
    for (let bin = 0; bin < 4; bin++) {
      nChosen = addToneRamp(src, pal, nChosen, nChosen + quota[bin]!, bin);
    }
  }
  nChosen = addFarthest(src, pal, nChosen, nWant, -1, nShade > 0);
  if (nChosen < nWant) nChosen = addFarthest(src, pal, nChosen, nWant, -1, false);

  const out: Array<[number, number, number]> = new Array(256);
  for (let i = 0; i < 256; i++) {
    const [sr, sg, sb] = src[i]!;
    const srcLum = colorLum(sr, sg, sb);
    const srcSat = colorSat(sr, sg, sb);
    let bestI = 0;
    let bestD = 0x7fffffff;
    for (let k = 0; k < nChosen; k++) {
      const [pr, pg, pb] = pal[k]!;
      let d = colorDist2(sr, sg, sb, pr, pg, pb);
      const lift = colorLum(pr, pg, pb) - srcLum;
      if (srcLum <= 250 && lift > 240) d += Math.trunc((lift * lift) / 16);
      if (nShade > 0) d += Math.trunc((lift * lift) / 48);
      const satD = colorSat(pr, pg, pb) - srcSat;
      if (srcSat <= 24 && satD > 16) d += satD * satD;
      if (d < bestD) {
        bestD = d;
        bestI = k;
        if (d === 0) break;
      }
    }
    const chosen = pal[bestI]!;
    let nR = Math.trunc((chosen[0] * 95) / 100);
    let nG = Math.trunc((chosen[1] * 95) / 100);
    let nB = Math.trunc((chosen[2] * 95) / 100);
    if (nShade > 0 && grayPct > 0 && toneBin(chosen[0], chosen[1], chosen[2]) >= 0) {
      const nMid = Math.trunc((nR + nB) / 2);
      if (nG > nMid) nG = nMid + Math.trunc(((nG - nMid) * (100 - grayPct)) / 100);
      const nGray = Math.trunc((nR + nG + nB) / 3);
      const nKeep = 100 - grayPct;
      nR = Math.trunc((nR * nKeep + nGray * grayPct) / 100);
      nG = Math.trunc((nG * nKeep + nGray * grayPct) / 100);
      nB = Math.trunc((nB * nKeep + nGray * grayPct) / 100);
    } else if (nShade === 0 && colorDist2(chosen[0], chosen[1], chosen[2], 19, 34, 11) <= 625) {
      const nGray = Math.trunc((Math.trunc((nR + nG + nB) / 3) * 85) / 100);
      nR = Math.trunc((nR + nGray * 2) / 3);
      nG = Math.trunc((nG + nGray * 2) / 3);
      nB = Math.trunc((nB + nGray * 2) / 3);
    }
    out[i] = [nR, nG, nB];
  }
  return out;
}
const SDL_TEXTUREACCESS_STREAMING = 1;
const SDL_QUIT = 0x100;
const SDL_KEYDOWN = 0x300;
const SDL_KEYUP = 0x301;
const SDL_MOUSEMOTION = 0x400;
const SDL_MOUSEBUTTONDOWN = 0x401;
const SDL_MOUSEBUTTONUP = 0x402;
const AUDIO_S16LSB = 0x8010;

export type GameEvent = {
  type: string;
  key?: number;
  sym?: number;
  repeat?: boolean;
  mod?: number;
  text?: string;
  dx?: number;
  dy?: number;
  button?: number;
};

type SdlApi = {
  SDL_Init: (flags: number) => number;
  SDL_Quit: () => void;
  SDL_GetError: () => string;
  SDL_GetTicks: () => number;
  SDL_Delay: (ms: number) => void;
  SDL_ShowCursor: (toggle: number) => number;
  SDL_SetRelativeMouseMode: (enabled: number) => number;
  SDL_CreateWindow: (title: string, x: number, y: number, w: number, h: number, flags: number) => unknown;
  SDL_DestroyWindow: (w: unknown) => void;
  SDL_SetWindowFullscreen: (w: unknown, flags: number) => number;
  SDL_SetWindowSize: (w: unknown, width: number, height: number) => void;
  SDL_SetWindowPosition: (w: unknown, x: number, y: number) => void;
  SDL_SetWindowTitle: (w: unknown, title: string) => void;
  SDL_GetWindowSize: (w: unknown, width: Buffer, height: Buffer) => void;
  SDL_CreateRenderer: (w: unknown, index: number, flags: number) => unknown;
  SDL_DestroyRenderer: (r: unknown) => void;
  SDL_RenderClear: (r: unknown) => number;
  SDL_RenderCopy: (r: unknown, t: unknown, src: null, dst: Buffer | null) => number;
  SDL_RenderPresent: (r: unknown) => void;
  SDL_CreateTexture: (r: unknown, format: number, access: number, w: number, h: number) => unknown;
  SDL_DestroyTexture: (t: unknown) => void;
  SDL_UpdateTexture: (t: unknown, rect: null, pixels: Buffer, pitch: number) => number;
  SDL_PollEvent: (ev: Buffer) => number;
  SDL_OpenAudioDevice: (
    device: null,
    iscapture: number,
    desired: Buffer,
    obtained: Buffer,
    allowed: number,
  ) => number;
  SDL_PauseAudioDevice: (dev: number, pause: number) => void;
  SDL_QueueAudio: (dev: number, data: Buffer, len: number) => number;
  SDL_GetQueuedAudioSize: (dev: number) => number;
  SDL_CloseAudioDevice: (dev: number) => void;
};

function libraryPath(): string {
  const env = process.env.SDL2_PATH;
  if (env && fs.existsSync(env)) return env;
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const candidates = [
    path.join(root, "lib", "SDL2.dll"),
    path.join(root, "SDL2.dll"),
    path.join(root, "lib", "libSDL2.so"),
    path.join(root, "lib", "libSDL2.so.0"),
    path.join(root, "lib", "libSDL2.dylib"),
    path.join(root, "..", "php_doom", "lib", "SDL2.dll"),
  ];
  for (const p of candidates) if (fs.existsSync(p)) return p;
  if (os.platform() === "win32") return "SDL2.dll";
  if (os.platform() === "darwin") return "libSDL2.dylib";
  return "libSDL2.so.0";
}

function loadSdl(): SdlApi {
  const lib = koffi.load(libraryPath());
  koffi.opaque("SDL_Window");
  koffi.opaque("SDL_Renderer");
  koffi.opaque("SDL_Texture");
  return {
    SDL_Init: lib.func("int SDL_Init(uint32 flags)"),
    SDL_Quit: lib.func("void SDL_Quit()"),
    SDL_GetError: lib.func("const char *SDL_GetError()"),
    SDL_GetTicks: lib.func("uint32 SDL_GetTicks()"),
    SDL_Delay: lib.func("void SDL_Delay(uint32 ms)"),
    SDL_ShowCursor: lib.func("int SDL_ShowCursor(int toggle)"),
    SDL_SetRelativeMouseMode: lib.func("int SDL_SetRelativeMouseMode(int enabled)"),
    SDL_CreateWindow: lib.func("SDL_Window *SDL_CreateWindow(const char *title, int x, int y, int w, int h, uint32 flags)"),
    SDL_DestroyWindow: lib.func("void SDL_DestroyWindow(SDL_Window *window)"),
    SDL_SetWindowFullscreen: lib.func("int SDL_SetWindowFullscreen(SDL_Window *window, uint32 flags)"),
    SDL_SetWindowSize: lib.func("void SDL_SetWindowSize(SDL_Window *window, int w, int h)"),
    SDL_SetWindowPosition: lib.func("void SDL_SetWindowPosition(SDL_Window *window, int x, int y)"),
    SDL_SetWindowTitle: lib.func("void SDL_SetWindowTitle(SDL_Window *window, const char *title)"),
    SDL_GetWindowSize: lib.func("void SDL_GetWindowSize(SDL_Window *window, _Out_ int *w, _Out_ int *h)"),
    SDL_CreateRenderer: lib.func("SDL_Renderer *SDL_CreateRenderer(SDL_Window *window, int index, uint32 flags)"),
    SDL_DestroyRenderer: lib.func("void SDL_DestroyRenderer(SDL_Renderer *renderer)"),
    SDL_RenderClear: lib.func("int SDL_RenderClear(SDL_Renderer *renderer)"),
    SDL_RenderCopy: lib.func("int SDL_RenderCopy(SDL_Renderer *renderer, SDL_Texture *texture, const void *srcrect, const void *dstrect)"),
    SDL_RenderPresent: lib.func("void SDL_RenderPresent(SDL_Renderer *renderer)"),
    SDL_CreateTexture: lib.func("SDL_Texture *SDL_CreateTexture(SDL_Renderer *renderer, uint32 format, int access, int w, int h)"),
    SDL_DestroyTexture: lib.func("void SDL_DestroyTexture(SDL_Texture *texture)"),
    SDL_UpdateTexture: lib.func("int SDL_UpdateTexture(SDL_Texture *texture, const void *rect, const void *pixels, int pitch)"),
    SDL_PollEvent: lib.func("int SDL_PollEvent(void *event)"),
    SDL_OpenAudioDevice: lib.func(
      "uint32 SDL_OpenAudioDevice(const char *device, int iscapture, const void *desired, void *obtained, int allowed_changes)",
    ),
    SDL_PauseAudioDevice: lib.func("void SDL_PauseAudioDevice(uint32 dev, int pause_on)"),
    SDL_QueueAudio: lib.func("int SDL_QueueAudio(uint32 dev, const void *data, uint32 len)"),
    SDL_GetQueuedAudioSize: lib.func("uint32 SDL_GetQueuedAudioSize(uint32 dev)"),
    SDL_CloseAudioDevice: lib.func("void SDL_CloseAudioDevice(uint32 dev)"),
  };
}

/** SDL2 video + audio (doomgeneric / i_video) via koffi. */
export class Video {
  static SCALE_MIN = 1;
  static SCALE_MAX = 6;

  fb = new Uint8Array(SCREENWIDTH * SCREENHEIGHT);
  fullscreen = false;
  scale = 2;
  showFps = false;
  crt = false;
  maxColors = 256;
  shadePct = 0;
  grayPct = 0;
  windowTitle = "DOOM";
  fpsValue = 0;

  private sdl: SdlApi | null = null;
  private window: unknown = null;
  private renderer: unknown = null;
  private texture: unknown = null;
  private audioDev = 0;
  private palette: Array<[number, number, number]> = Array.from({ length: 256 }, () => [0, 0, 0]);
  private argb = Buffer.alloc(SCREENWIDTH * SCREENHEIGHT * 4);
  private eventBuf = Buffer.alloc(64);
  private fpsFrames = 0;
  private fpsStamp = 0;
  private mix: number[] = [];
  private mouseGrab = false;
  private texW = SCREENWIDTH;
  private texH = SCREENHEIGHT;
  private crtW = 0;
  private crtH = 0;
  private crtMap = new Uint16Array(0);
  private crtGain = new Uint8Array(0);
  private crtMask = new Int32Array(9);
  private crtBlur = new Uint8Array(SCREENWIDTH * SCREENHEIGHT * 3);
  private winWBuf = Buffer.alloc(4);
  private winHBuf = Buffer.alloc(4);
  private dstRect = Buffer.alloc(16);

  init(fullscreen = false, title = "DOOM"): void {
    this.fb.fill(0);
    this.fullscreen = fullscreen;
    this.windowTitle = title;
    this.sdl = loadSdl();
    const flags = SDL_INIT_VIDEO | SDL_INIT_EVENTS | SDL_INIT_AUDIO;
    if (this.sdl.SDL_Init(flags) !== 0) throw new Error(`SDL_Init: ${this.error()}`);
    this.sdl.SDL_ShowCursor(0);
    this.applyMode();
    this.openAudio();
    this.fpsStamp = this.ticksMs();
  }

  ticksMs(): number {
    return this.sdl ? this.sdl.SDL_GetTicks() >>> 0 : Date.now();
  }

  delay(ms: number): void {
    this.sdl?.SDL_Delay(ms);
  }

  setRelativeMouse(on: boolean): void {
    if (!this.sdl || on === this.mouseGrab) return;
    this.mouseGrab = on;
    this.sdl.SDL_SetRelativeMouseMode(on ? 1 : 0);
    this.sdl.SDL_ShowCursor(on ? 0 : 1);
  }

  toggleFullscreen(): void {
    this.fullscreen = !this.fullscreen;
    this.applyMode();
  }

  changeScale(delta: number): boolean {
    if (this.fullscreen) return false;
    const next = Math.max(Video.SCALE_MIN, Math.min(Video.SCALE_MAX, this.scale + delta));
    if (next === this.scale) return false;
    this.scale = next;
    this.applyMode();
    return true;
  }

  setPalette(playpal: Buffer): void {
    this.setPaletteRaw(playpal.subarray(0, 768));
  }

  setPaletteRaw(rgb768: Buffer): void {
    const src: Array<[number, number, number]> = new Array(256);
    for (let i = 0; i < 256; i++) {
      src[i] = [rgb768[i * 3]! & 255, rgb768[i * 3 + 1]! & 255, rgb768[i * 3 + 2]! & 255];
    }
    const out = quantizeColors(src, this.maxColors, this.shadePct, this.grayPct);
    for (let i = 0; i < 256; i++) this.palette[i] = out[i]!;
  }

  playSfx(pcm: Buffer, volume = 8): void {
    if (!pcm.length || !this.sdl || !this.audioDev) return;
    const gain = Math.max(0, Math.min(15, volume)) / 15;
    const n = Math.trunc(pcm.length / 2);
    if (this.mix.length < n) this.mix.length = n;
    for (let i = 0; i < n; i++) {
      let s = pcm[i * 2]! | (pcm[i * 2 + 1]! << 8);
      if (s >= 0x8000) s -= 0x10000;
      const mixed = (this.mix[i] ?? 0) + Math.trunc(s * gain);
      this.mix[i] = Math.max(-32768, Math.min(32767, mixed));
    }
  }

  present(): void {
    if (!this.sdl || !this.renderer) return;
    this.pumpAudio();
    if (this.crt) this.presentCrt();
    else this.presentFlat();
    this.sdl.SDL_RenderPresent(this.renderer);
    this.fpsFrames++;
    const now = this.ticksMs();
    if (now - this.fpsStamp >= 1000) {
      this.fpsValue = this.fpsFrames;
      this.fpsFrames = 0;
      this.fpsStamp = now;
    }
    if (this.showFps) {
      this.sdl.SDL_SetWindowTitle(this.window, `${this.windowTitle} - ${this.fpsValue} FPS`);
    }
  }

  pollEvents(): GameEvent[] {
    const out: GameEvent[] = [];
    if (!this.sdl) return out;
    while (this.sdl.SDL_PollEvent(this.eventBuf)) {
      const type = this.eventBuf.readUInt32LE(0);
      if (type === SDL_QUIT) {
        out.push({ type: "quit" });
        continue;
      }
      if (type === SDL_MOUSEMOTION) {
        out.push({
          type: "mousemotion",
          dx: this.eventBuf.readInt32LE(28),
          dy: this.eventBuf.readInt32LE(32),
        });
        continue;
      }
      if (type === SDL_MOUSEBUTTONDOWN || type === SDL_MOUSEBUTTONUP) {
        out.push({
          type: type === SDL_MOUSEBUTTONDOWN ? "mousedown" : "mouseup",
          button: this.eventBuf[16],
        });
        continue;
      }
      if (type !== SDL_KEYDOWN && type !== SDL_KEYUP) continue;
      const repeat = this.eventBuf[13] !== 0;
      if (repeat && type === SDL_KEYDOWN) continue;
      let scan = this.eventBuf.readInt32LE(16);
      let sym = this.eventBuf.readInt32LE(20);
      if (scan === 45 || scan === 86) sym = scan === 86 ? KP_MINUS : MINUS;
      else if (scan === 46 || scan === 87) sym = scan === 87 ? KP_PLUS : EQUALS;
      else if (sym === PLUS) sym = EQUALS;
      const mod = this.eventBuf.readUInt16LE(24);
      const text = sym >= 32 && sym < 127 ? String.fromCharCode(sym) : "";
      out.push({
        type: type === SDL_KEYDOWN ? "keydown" : "keyup",
        key: sym,
        sym,
        repeat,
        mod,
        text,
      });
    }
    return out;
  }

  shutdown(): void {
    if (!this.sdl) return;
    if (this.audioDev) {
      this.sdl.SDL_CloseAudioDevice(this.audioDev);
      this.audioDev = 0;
    }
    if (this.texture) {
      this.sdl.SDL_DestroyTexture(this.texture);
      this.texture = null;
    }
    if (this.renderer) {
      this.sdl.SDL_DestroyRenderer(this.renderer);
      this.renderer = null;
    }
    if (this.window) {
      this.sdl.SDL_DestroyWindow(this.window);
      this.window = null;
    }
    this.sdl.SDL_Quit();
    this.sdl = null;
  }

  private presentFlat(): void {
    if (!this.ensureTexture(SCREENWIDTH, SCREENHEIGHT)) return;
    const n = SCREENWIDTH * SCREENHEIGHT;
    const pixels = this.argb;
    for (let i = 0; i < n; i++) {
      const [r, g, b] = this.palette[this.fb[i]! & 0xff]!;
      const o = i * 4;
      pixels[o] = b;
      pixels[o + 1] = g;
      pixels[o + 2] = r;
      pixels[o + 3] = 255;
    }
    this.sdl!.SDL_UpdateTexture(this.texture, null, pixels, SCREENWIDTH * 4);
    this.sdl!.SDL_RenderClear(this.renderer);
    this.sdl!.SDL_RenderCopy(this.renderer, this.texture, null, null);
  }

  /** Curvatura, vinheta, scanline, fosforo e borrao horizontal, no tamanho da janela. */
  private presentCrt(): void {
    const view = this.outputView();
    if (!this.ensureTexture(view.dw, view.dh)) return;
    this.buildCrt(view.dw, view.dh);
    const blur = this.crtBlur;
    for (let y = 0; y < SCREENHEIGHT; y++) {
      const row = y * SCREENWIDTH;
      for (let x = 0; x < SCREENWIDTH; x++) {
        const c = this.palette[this.fb[row + x]! & 255]!;
        const l = this.palette[this.fb[row + (x > 0 ? x - 1 : x)]! & 255]!;
        const rgt = this.palette[this.fb[row + (x < SCREENWIDTH - 1 ? x + 1 : x)]! & 255]!;
        const o = (row + x) * 3;
        blur[o] = (l[0] + 2 * c[0] + rgt[0]) >> 2;
        blur[o + 1] = (l[1] + 2 * c[1] + rgt[1]) >> 2;
        blur[o + 2] = (l[2] + 2 * c[2] + rgt[2]) >> 2;
      }
    }
    const dw = view.dw;
    const dh = view.dh;
    const bytes = dw * dh * 4;
    if (this.argb.length < bytes) this.argb = Buffer.alloc(bytes);
    const pixels = this.argb;
    const map = this.crtMap;
    const gain = this.crtGain;
    const mask = this.crtMask;
    for (let y = 0; y < dh; y++) {
      let k = 0;
      const row = y * dw;
      for (let x = 0; x < dw; x++) {
        const p = row + x;
        const o = p * 4;
        const idx = map[p]!;
        if (idx === 0xffff) {
          pixels[o] = 0;
          pixels[o + 1] = 0;
          pixels[o + 2] = 0;
        } else {
          const bi = idx * 3;
          const g = gain[p]!;
          const mk = k * 3;
          let r = (blur[bi]! * g * mask[mk]!) >> 16;
          let gr = (blur[bi + 1]! * g * mask[mk + 1]!) >> 16;
          let b = (blur[bi + 2]! * g * mask[mk + 2]!) >> 16;
          if (r > 255) r = 255;
          if (gr > 255) gr = 255;
          if (b > 255) b = 255;
          pixels[o] = b;
          pixels[o + 1] = gr;
          pixels[o + 2] = r;
        }
        pixels[o + 3] = 255;
        if (++k === 3) k = 0;
      }
    }
    this.dstRect.writeInt32LE(view.dx, 0);
    this.dstRect.writeInt32LE(view.dy, 4);
    this.dstRect.writeInt32LE(dw, 8);
    this.dstRect.writeInt32LE(dh, 12);
    this.sdl!.SDL_UpdateTexture(this.texture, null, pixels, dw * 4);
    this.sdl!.SDL_RenderClear(this.renderer);
    this.sdl!.SDL_RenderCopy(this.renderer, this.texture, null, this.dstRect);
  }

  private outputView(): { dw: number; dh: number; dx: number; dy: number } {
    let winW = SCREENWIDTH * this.scale;
    let winH = SCREENHEIGHT * this.scale;
    if (this.fullscreen && this.sdl && this.window) {
      this.sdl.SDL_GetWindowSize(this.window, this.winWBuf, this.winHBuf);
      const w = this.winWBuf.readInt32LE(0);
      const h = this.winHBuf.readInt32LE(0);
      if (w > 0 && h > 0) {
        winW = w;
        winH = h;
      }
    }
    let fit = Math.min(Math.floor(winW / SCREENWIDTH), Math.floor(winH / SCREENHEIGHT));
    if (fit < 1) fit = 1;
    const dw = SCREENWIDTH * fit;
    const dh = SCREENHEIGHT * fit;
    return { dw, dh, dx: Math.trunc((winW - dw) / 2), dy: Math.trunc((winH - dh) / 2) };
  }

  private buildCrt(dw: number, dh: number): void {
    if (this.crtW === dw && this.crtH === dh) return;
    const map = new Uint16Array(dw * dh);
    const gain = new Uint8Array(dw * dh);
    let sl = dh / SCREENHEIGHT - 1;
    if (sl < 0) sl = 0;
    if (sl > 1) sl = 1;
    sl *= 0.45;
    for (let y = 0; y < dh; y++) {
      const ny = (2 * y) / dh - 1;
      const ny2 = (ny * ny) / 32;
      for (let x = 0; x < dw; x++) {
        const nx = (2 * (x + 0.5)) / dw - 1;
        const u = nx * (1 + ny2);
        const v = ny * (1 + (nx * nx) / 24);
        const p = y * dw + x;
        if (u <= -1 || u >= 1 || v <= -1 || v >= 1) {
          map[p] = 0xffff;
          continue;
        }
        const sx = (u + 1) * 0.5 * SCREENWIDTH;
        const sy = (v + 1) * 0.5 * SCREENHEIGHT;
        let ix = Math.trunc(sx);
        let iy = Math.trunc(sy);
        if (ix > SCREENWIDTH - 1) ix = SCREENWIDTH - 1;
        if (iy > SCREENHEIGHT - 1) iy = SCREENHEIGHT - 1;
        if (ix < 0) ix = 0;
        if (iy < 0) iy = 0;
        const d = sy - iy - 0.5;
        const uu = (u + 1) * 0.5;
        const vv = (v + 1) * 0.5;
        let g = (1 - sl * 4 * d * d) * Math.pow(16 * uu * vv * (1 - uu) * (1 - vv), 0.12) * 255;
        if (!Number.isFinite(g) || g < 0) g = 0;
        if (g > 255) g = 255;
        map[p] = iy * SCREENWIDTH + ix;
        gain[p] = Math.trunc(g + 0.5);
      }
    }
    const wide = dw >= 2 * SCREENWIDTH;
    const off = wide ? 0.7 : 1;
    const boost = wide ? 1.4 : 1.15;
    for (let m = 0; m < 3; m++) {
      for (let c = 0; c < 3; c++) {
        this.crtMask[m * 3 + c] = Math.trunc(256 * boost * (m === c ? 1 : off));
      }
    }
    this.crtMap = map;
    this.crtGain = gain;
    this.crtW = dw;
    this.crtH = dh;
  }

  private ensureTexture(w: number, h: number): boolean {
    if (!this.sdl || !this.renderer) return false;
    if (this.texture && this.texW === w && this.texH === h) return true;
    if (this.texture) {
      this.sdl.SDL_DestroyTexture(this.texture);
      this.texture = null;
    }
    this.texture = this.sdl.SDL_CreateTexture(
      this.renderer,
      SDL_PIXELFORMAT_ARGB8888,
      SDL_TEXTUREACCESS_STREAMING,
      w,
      h,
    );
    if (!this.texture) return false;
    this.texW = w;
    this.texH = h;
    return true;
  }

  private applyMode(): void {
    if (!this.sdl) return;
    const w = SCREENWIDTH * this.scale;
    const h = SCREENHEIGHT * this.scale;
    if (!this.window) {
      this.window = this.sdl.SDL_CreateWindow(
        this.windowTitle,
        SDL_WINDOWPOS_CENTERED,
        SDL_WINDOWPOS_CENTERED,
        w,
        h,
        SDL_WINDOW_SHOWN | SDL_WINDOW_RESIZABLE,
      );
      if (!this.window) throw new Error(`SDL_CreateWindow: ${this.error()}`);
      this.renderer = this.sdl.SDL_CreateRenderer(
        this.window,
        -1,
        SDL_RENDERER_ACCELERATED | SDL_RENDERER_PRESENTVSYNC,
      );
      if (!this.renderer) this.renderer = this.sdl.SDL_CreateRenderer(this.window, -1, 0);
      if (!this.renderer) throw new Error(`SDL_CreateRenderer: ${this.error()}`);
      this.texture = this.sdl.SDL_CreateTexture(
        this.renderer,
        SDL_PIXELFORMAT_ARGB8888,
        SDL_TEXTUREACCESS_STREAMING,
        SCREENWIDTH,
        SCREENHEIGHT,
      );
      if (!this.texture) throw new Error(`SDL_CreateTexture: ${this.error()}`);
      this.texW = SCREENWIDTH;
      this.texH = SCREENHEIGHT;
    }
    this.sdl.SDL_SetWindowFullscreen(this.window, this.fullscreen ? SDL_WINDOW_FULLSCREEN_DESKTOP : 0);
    if (!this.fullscreen) {
      this.sdl.SDL_SetWindowSize(this.window, w, h);
      this.sdl.SDL_SetWindowPosition(this.window, SDL_WINDOWPOS_CENTERED, SDL_WINDOWPOS_CENTERED);
    }
    this.sdl.SDL_SetWindowTitle(this.window, this.windowTitle);
  }

  private openAudio(): void {
    if (!this.sdl) return;
    try {
      const spec = Buffer.alloc(32);
      spec.writeInt32LE(11025, 0);
      spec.writeUInt16LE(AUDIO_S16LSB, 4);
      spec[6] = 1;
      spec.writeUInt16LE(512, 8);
      const have = Buffer.alloc(32);
      const dev = this.sdl.SDL_OpenAudioDevice(null, 0, spec, have, 0);
      if (dev) {
        this.audioDev = dev >>> 0;
        this.sdl.SDL_PauseAudioDevice(this.audioDev, 0);
      }
    } catch {
      this.audioDev = 0;
    }
  }

  private pumpAudio(): void {
    if (!this.sdl || !this.audioDev || !this.mix.length) return;
    const queued = this.sdl.SDL_GetQueuedAudioSize(this.audioDev) >>> 0;
    // 16-bit mono at 11025 Hz. Three device periods (~139 ms). A 1 s
    // backlog is what made shots and doors land late.
    const limit = 512 * 2 * 3;
    if (queued >= limit) return;
    const n = Math.min(this.mix.length, Math.floor((limit - queued) / 2));
    if (n < 1) return;
    const chunk = this.mix.splice(0, n);
    const pcm = Buffer.alloc(n * 2);
    for (let i = 0; i < n; i++) pcm.writeUInt16LE(chunk[i]! & 0xffff, i * 2);
    this.sdl.SDL_QueueAudio(this.audioDev, pcm, pcm.length);
  }

  private error(): string {
    try {
      return this.sdl ? String(this.sdl.SDL_GetError() || "") : "unknown SDL error";
    } catch {
      return "unknown SDL error";
    }
  }
}

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
  SDL_CreateRenderer: (w: unknown, index: number, flags: number) => unknown;
  SDL_DestroyRenderer: (r: unknown) => void;
  SDL_RenderClear: (r: unknown) => number;
  SDL_RenderCopy: (r: unknown, t: unknown, src: null, dst: null) => number;
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
    for (let i = 0; i < 256; i++) {
      this.palette[i] = [rgb768[i * 3]!, rgb768[i * 3 + 1]!, rgb768[i * 3 + 2]!];
    }
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
    if (!this.sdl || !this.renderer || !this.texture) return;
    this.pumpAudio();
    const n = SCREENWIDTH * SCREENHEIGHT;
    const pixels = this.argb;
    for (let i = 0; i < n; i++) {
      let [r, g, b] = this.palette[this.fb[i]! & 0xff]!;
      if (this.crt) {
        const scan = (Math.trunc(i / SCREENWIDTH) & 1) ? 180 : 256;
        r = Math.min(255, Math.trunc((r * scan) / 256));
        g = Math.min(255, Math.trunc((g * scan) / 256));
        b = Math.min(255, Math.trunc((b * scan) / 256));
      }
      const o = i * 4;
      pixels[o] = b;
      pixels[o + 1] = g;
      pixels[o + 2] = r;
      pixels[o + 3] = 255;
    }
    this.sdl.SDL_UpdateTexture(this.texture, null, pixels, SCREENWIDTH * 4);
    this.sdl.SDL_RenderClear(this.renderer);
    this.sdl.SDL_RenderCopy(this.renderer, this.texture, null, null);
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
    if (queued > 11025 * 2) return;
    const n = Math.min(this.mix.length, 2048);
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

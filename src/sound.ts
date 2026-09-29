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

import * as fs from "node:fs";
import { createRequire } from "node:module";
import * as os from "node:os";
import * as path from "node:path";
import { u32 } from "./bin.ts";
import { intdiv } from "./compat.ts";
import { mus2mid } from "./mus2mid.ts";
import type { Video } from "./video.ts";
import type { Wad } from "./wad.ts";

type MciFunc = (command: string, buffer: Buffer | null, size: number, cb: null) => number;

export class Sound {
  private static readonly DOOM2_MUSIC = [
    "runnin", "stalks", "countd", "betwee", "doom", "the_da", "shawn", "ddtblu",
    "in_cit", "dead", "stlks2", "theda2", "doom2", "ddtbl2", "runni2", "dead2",
    "stlks3", "romero", "shawn2", "messag", "count2", "ddtbl3", "ampie", "theda3",
    "adrian", "messg2", "romer2", "tense", "shawn3", "openin", "evil", "ultima",
  ];

  private wad: Wad | null = null;
  private cache: Record<string, Buffer | null> = {};
  private musicPath: string | null = null;
  private musicName = "";
  private musicLoop = false;
  private mciPlaying = false;
  private mciSend: MciFunc | null = null;
  output: Video | null = null;
  enabled = true;
  sfxVolume = 8;
  musicVolume = 8;

  init(wad: Wad): void {
    this.wad = wad;
    if (process.platform === "win32") {
      try {
        const require = createRequire(import.meta.url);
        const koffi = require("koffi");
        const lib = koffi.load("winmm.dll");
        this.mciSend = lib.func(
          "unsigned long mciSendStringA(const char*, char*, unsigned int, void*)",
        ) as MciFunc;
      } catch {
        this.mciSend = null;
      }
    }
  }

  /**
   * Warms the PCM cache. Video/SDL can fetch the bytes with getPcm() and
   * submit them to its mixer without coupling this module to SDL.
   */
  play(name: string): void {
    if (!this.enabled) return;
    const pcm = this.getPcm(name);
    if (pcm !== null && this.output !== null) this.output.playSfx(pcm, this.sfxVolume);
  }

  getPcm(name: string): Buffer | null {
    const key = name.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(this.cache, key)) return this.cache[key]!;
    if (this.wad === null) return (this.cache[key] = null);
    const lump = "DS" + key.slice(0, 6).toUpperCase();
    const number = this.wad.checkNumForName(lump);
    if (number < 0) return (this.cache[key] = null);
    return (this.cache[key] = Sound.decodeDs(this.wad.cacheLumpNum(number)));
  }

  playTitleMusic(): void {
    if (this.wad === null) return;
    if (this.wad.checkNumForName("MAP01") >= 0) this.changeMusic("dm2ttl", false);
    else if (this.wad.checkNumForName("D_INTROA") >= 0) this.changeMusic("introa", false);
    else this.changeMusic("intro", false);
  }

  playLevelMusic(episode: number, map: number): void {
    if (this.wad === null) return;
    const name =
      this.wad.checkNumForName("MAP01") >= 0
        ? Sound.DOOM2_MUSIC[(Math.max(1, map) - 1) % Sound.DOOM2_MUSIC.length]!
        : `e${episode}m${map}`;
    this.changeMusic(name, true);
  }

  changeMusic(name: string, looping = true): void {
    if (this.wad === null || name === "" || name.toLowerCase() === this.musicName) return;
    const number = this.wad.checkNumForName("D_" + name.slice(0, 6).toUpperCase());
    if (number < 0) return;
    const midi = mus2mid(this.wad.cacheLumpNum(number));
    if (midi === null || midi.length === 0) return;
    this.stopMusic();
    let midPath: string;
    try {
      midPath = path.join(os.tmpdir(), `doom_${process.pid}_${Date.now()}.mid`);
      fs.writeFileSync(midPath, midi);
    } catch {
      return;
    }
    this.musicPath = midPath;
    this.musicName = name.toLowerCase();
    this.musicLoop = looping;
    const quoted = midPath.replace(/\//g, "\\");
    this.mci("close doommus");
    const opened =
      this.mci('open "' + quoted + '" type sequencer alias doommus') === 0 ||
      this.mci('open "' + quoted + '" alias doommus') === 0;
    this.mciPlaying = opened && this.mci("play doommus from 0") === 0;
    if (this.mciPlaying) this.setMusicVolume(this.musicVolume);
  }

  setSfxVolume(volume: number): void {
    this.sfxVolume = Math.max(0, Math.min(15, volume));
  }

  setMusicVolume(volume: number): void {
    this.musicVolume = Math.max(0, Math.min(15, volume));
    if (this.mciPlaying) this.mci("setaudio doommus volume to " + intdiv(this.musicVolume * 1000, 15));
  }

  stopMusic(): void {
    if (this.mciPlaying) this.mci("close doommus");
    this.mciPlaying = false;
    this.musicName = "";
    if (this.musicPath !== null) {
      try {
        fs.unlinkSync(this.musicPath);
      } catch {
        /* ignore */
      }
      this.musicPath = null;
    }
  }

  update(): void {
    if (!this.mciPlaying || !this.musicLoop || this.musicPath === null) return;
    const mode = this.mciStatus("status doommus mode").toLowerCase();
    if (mode !== "" && mode !== "playing") this.mci("play doommus from 0");
  }

  private mci(command: string): number {
    if (this.mciSend === null) return 1;
    try {
      return this.mciSend(command, null, 0, null) | 0;
    } catch {
      return 1;
    }
  }

  private mciStatus(command: string): string {
    if (this.mciSend === null) return "";
    try {
      const buffer = Buffer.alloc(64);
      if ((this.mciSend(command, buffer, 64, null) | 0) !== 0) return "";
      const end = buffer.indexOf(0);
      return buffer.toString("latin1", 0, end < 0 ? buffer.length : end);
    } catch {
      return "";
    }
  }

  private static decodeDs(data: Buffer): Buffer | null {
    const size = data.length;
    if (size < 8 || data[0] !== 3 || data[1] !== 0) return null;
    const rate = data[2]! | (data[3]! << 8);
    const length = u32(data, 4);
    if (rate <= 0 || length > size - 8 || length <= 48) return null;
    const samples = data.subarray(16, 16 + (length - 32));
    if (samples.length === 0) return null;
    const sourceLength = samples.length;
    const count = rate === 11025 ? sourceLength : Math.max(1, intdiv(sourceLength * 11025, rate));
    const pcm = Buffer.alloc(count * 2);
    for (let i = 0; i < count; ++i) {
      const source = Math.min(sourceLength - 1, intdiv(i * sourceLength, count));
      const sample = (samples[source]! - 128) << 8;
      pcm.writeUInt16LE(sample & 0xffff, i * 2);
    }
    return pcm;
  }
}

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

import { name8, u32 } from "./bin.ts";
import * as fs from "node:fs";
import * as path from "node:path";

export class Lump {
  cache: Buffer | null = null;
  constructor(
    public name: string,
    public position: number,
    public size: number,
    public wadPath: string,
  ) {}
}

/** WAD loader (w_wad / w_file_stdc). Lump names are 8-byte, case-insensitive. */
export class Wad {
  lumps: Lump[] = [];
  private index = new Map<string, number>();

  addFile(filePath: string): void {
    const absolute = path.resolve(filePath);
    if (!fs.existsSync(absolute)) throw new Error(`WAD not found: ${filePath}`);
    const fd = fs.openSync(absolute, "r");
    try {
      const header = Buffer.alloc(12);
      if (fs.readSync(fd, header, 0, 12, 0) !== 12) throw new Error(`invalid WAD header: ${absolute}`);
      const ident = header.subarray(0, 4).toString("ascii");
      if (ident !== "IWAD" && ident !== "PWAD") throw new Error(`not a WAD: ${absolute}`);
      const numLumps = u32(header, 4);
      const infoTableOfs = u32(header, 8);
      const directory = Buffer.alloc(numLumps * 16);
      if (numLumps && fs.readSync(fd, directory, 0, directory.length, infoTableOfs) !== directory.length) {
        throw new Error(`truncated WAD directory: ${absolute}`);
      }
      const start = this.lumps.length;
      for (let i = 0; i < numLumps; i++) {
        const off = i * 16;
        this.lumps.push(new Lump(name8(directory, off + 8), u32(directory, off), u32(directory, off + 4), absolute));
      }
      for (let i = start; i < this.lumps.length; i++) this.index.set(this.lumps[i]!.name, i);
    } finally {
      fs.closeSync(fd);
    }
  }

  numLumps(): number {
    return this.lumps.length;
  }

  checkNumForName(name: string): number {
    const nul = name.indexOf("\0");
    if (nul >= 0) name = name.slice(0, nul);
    const key = name.replace(/ +$/g, "").toUpperCase().slice(0, 8);
    return this.index.get(key) ?? -1;
  }

  getNumForName(name: string): number {
    const n = this.checkNumForName(name);
    if (n < 0) throw new Error(`lump not found: ${name}`);
    return n;
  }

  lumpLength(num: number): number {
    return this.lumps[num]!.size;
  }

  cacheLumpNum(num: number): Buffer {
    const lump = this.lumps[num]!;
    if (lump.cache === null) {
      const buf = Buffer.alloc(lump.size);
      if (lump.size) {
        const fd = fs.openSync(lump.wadPath, "r");
        try {
          if (fs.readSync(fd, buf, 0, lump.size, lump.position) !== lump.size) {
            throw new Error(`truncated lump: ${lump.name}`);
          }
        } finally {
          fs.closeSync(fd);
        }
      }
      lump.cache = buf;
    }
    return lump.cache;
  }

  cacheLumpName(name: string): Buffer {
    return this.cacheLumpNum(this.getNumForName(name));
  }

  lumpName(num: number): string {
    return this.lumps[num]!.name;
  }
}

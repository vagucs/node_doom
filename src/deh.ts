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
import { TICRATE } from "./defs.ts";
import type { Wad } from "./wad.ts";

const SIGS = ["Patch File for DeHackEd v2.3", "Patch File for DeHackEd v3.0"];
const THING_DOOMED: Record<number, number> = {
  2: 3004, 3: 9, 4: 64, 6: 66, 9: 67, 12: 3001, 13: 3002, 15: 3005, 16: 3003,
  18: 69, 19: 3006, 20: 7, 21: 68, 22: 16, 23: 71, 24: 84, 25: 72, 31: 2035,
};
const BEX: Record<string, string> = {
  STSTR_DQDON: "Degreelessness Mode On",
  STSTR_DQDOFF: "Degreelessness Mode Off",
  STSTR_KFAADDED: "Very Happy Ammo Added",
  STSTR_FAADDED: "Ammo Added",
  STSTR_NCON: "No Clipping Mode ON",
  STSTR_NCOFF: "No Clipping Mode OFF",
  STSTR_BEHOLD: "invin visis rad allmap lite amp",
  STSTR_BEHOLDX: "Power-up Toggled",
  STSTR_CHOPPERS: "... doesn't suck - GM",
  STSTR_CLEV: "Changing Level...",
  STSTR_MUS: "Music Change",
  STSTR_NOMUS: "IMPOSSIBLE SELECTION",
  GOTSTIM: "Picked up a stimpack.",
  GOTMEDIKIT: "Picked up a medikit.",
  GOTHTHBONUS: "You pick up a health bonus.",
  GOTARMBONUS: "You pick up an armor bonus.",
  GOTARMOR: "Picked up the armor.",
  GOTMEGA: "Picked up the MegaArmor!",
  GOTSUPER: "Supercharge!",
  GOTMSPHERE: "MegaSphere!",
  GOTBERSERK: "Berserk!",
  GOTINVUL: "Invulnerability!",
  GOTINVIS: "Partial Invisibility",
  GOTSUIT: "Radiation Shielding Suit",
  GOTMAP: "Computer Area Map",
  GOTVISOR: "Light Amplification Visor",
  GGSAVED: "game saved.",
  AMSTR_FOLLOWON: "Follow Mode ON",
  AMSTR_FOLLOWOFF: "Follow Mode OFF",
  AMSTR_GRIDON: "Grid ON",
  AMSTR_GRIDOFF: "Grid OFF",
  AMSTR_MARKSCLEARED: "All Marks Cleared",
  MSGOFF: "Messages Off",
  MSGON: "Messages On",
  DETAILHI: "High detail",
  DETAILLO: "Low detail",
  GOTSHOTGUN: "You got the shotgun!",
  GOTSHOTGUN2: "You got the super shotgun!",
  GOTCHAINGUN: "You got the chaingun!",
  GOTLAUNCHER: "You got the rocket launcher!",
  GOTPLASMA: "You got the plasma gun!",
  GOTBFG9000: "You got the BFG9000!",
  GOTCHAINSAW: "A chainsaw!  Find some meat!",
};
const MISC: Record<string, keyof Deh> = {
  "Initial Health": "initialHealth",
  "Initial Bullets": "initialBullets",
  "Max Health": "maxHealth",
  "Max Armor": "maxArmor",
  "Green Armor Class": "greenArmorClass",
  "Blue Armor Class": "blueArmorClass",
  "Max Soulsphere": "maxSoulsphere",
  "Soulsphere Health": "soulsphereHealth",
  "Megasphere Health": "megasphereHealth",
  "God Mode Health": "godModeHealth",
  "IDFA Armor": "idfaArmor",
  "IDFA Armor Class": "idfaArmorClass",
  "IDKFA Armor": "idkfaArmor",
  "IDKFA Armor Class": "idkfaArmorClass",
  "BFG Cells/Shot": "bfgCellsPerShot",
};

export class CheatSeq {
  charsRead = 0;
  paramBuf = "";
  constructor(
    public action: string,
    public sequence: string,
    public paramChars = 0,
    public dehName: string | null = null,
  ) {}

  feed(ch: string): string | null {
    const seq = this.sequence;
    if (!seq) return null;
    if (this.charsRead < seq.length) {
      if (ch === seq[this.charsRead]) this.charsRead++;
      else this.charsRead = ch === seq[0] ? 1 : 0;
      if (this.charsRead < seq.length) return null;
      if (this.paramChars <= 0) {
        this.charsRead = 0;
        return "";
      }
      return null;
    }
    if (this.paramBuf.length < this.paramChars) this.paramBuf += ch;
    if (this.paramBuf.length >= this.paramChars) {
      const buf = this.paramBuf;
      this.charsRead = 0;
      this.paramBuf = "";
      return buf;
    }
    return null;
  }
}

interface Ctx {
  data: string;
  pos: number;
  line: number;
  name: string;
}

export class Deh {
  files: string[] = [];
  nodeh = false;
  dehlump = false;
  applyCheats = true;
  allowLongStrings = false;
  allowLongCheats = false;
  allowExtendedStrings = false;
  replacements: Record<string, string> = {};
  cheats: CheatSeq[] = Deh.makeCheats();
  initialHealth = 100;
  initialBullets = 50;
  maxHealth = 200;
  maxArmor = 200;
  greenArmorClass = 1;
  blueArmorClass = 2;
  maxSoulsphere = 200;
  soulsphereHealth = 100;
  megasphereHealth = 200;
  godModeHealth = 100;
  idfaArmor = 200;
  idfaArmorClass = 2;
  idkfaArmor = 200;
  idkfaArmorClass = 2;
  bfgCellsPerShot = 40;
  speciesInfighting = 0;
  maxammo = [200, 50, 300, 50];
  clipammo = [10, 4, 20, 1];
  thingHp: Record<number, number> = {};

  static makeCheats(): CheatSeq[] {
    return [
      new CheatSeq("god", "iddqd", 0, "iddqd"),
      new CheatSeq("kfa", "idkfa", 0, "idkfa"),
      new CheatSeq("fa", "idfa", 0, "idfa"),
      new CheatSeq("noclip2", "idclip", 0, "idclip"),
      new CheatSeq("noclip", "idspispopd", 0, "idspispopd"),
      new CheatSeq("iddt", "iddt"),
      new CheatSeq("beholdv", "idbeholdv"),
      new CheatSeq("beholds", "idbeholds"),
      new CheatSeq("beholdi", "idbeholdi"),
      new CheatSeq("beholdr", "idbeholdr"),
      new CheatSeq("beholda", "idbeholda"),
      new CheatSeq("beholdl", "idbeholdl"),
      new CheatSeq("behold", "idbehold", 0, "idbehold"),
      new CheatSeq("choppers", "idchoppers", 0, "idchoppers"),
      new CheatSeq("mypos", "idmypos", 0, "idmypos"),
      new CheatSeq("clev", "idclev", 2, "idclev"),
      new CheatSeq("mus", "idmus", 2, "idmus"),
    ];
  }

  static powerTics(): number[] {
    return [30 * TICRATE, 1, 60 * TICRATE, 60 * TICRATE, 1, 120 * TICRATE];
  }

  string(text: string): string {
    return this.replacements[text] ?? text;
  }

  loadAfterIwad(wad: Wad, iwadPath: string): void {
    if (!this.nodeh) {
      for (let i = 0; i < wad.lumps.length; i++) {
        if (wad.lumps[i]!.name === "DEHACKED") this.loadLump(wad, i);
      }
    }
    for (const file of this.files) {
      if (fs.existsSync(file)) this.loadFile(file);
      else process.stdout.write(`DEH_LoadFile: Unable to open ${file}\n`);
    }
  }

  loadFile(filePath: string): void {
    const data = fs.readFileSync(filePath, "latin1");
    process.stdout.write(` loading ${filePath}\n`);
    this.parse(data, filePath);
  }

  loadLump(wad: Wad, lumpnum: number): void {
    const name = wad.lumpName(lumpnum);
    process.stdout.write(` loading lump ${name}\n`);
    this.parse(wad.cacheLumpNum(lumpnum).toString("latin1"), name);
  }

  private parse(data: string, name: string): void {
    this.allowLongStrings = this.allowLongCheats = this.allowExtendedStrings = false;
    const ctx: Ctx = { data, pos: 0, line: 1, name };
    const first = this.readLine(ctx, false);
    if (first === null || !SIGS.includes(first.trim())) {
      process.stdout.write(`${name}: This is not a valid dehacked patch file!\n`);
      return;
    }
    let section: string | null = null;
    let tag: number | null = null;
    while (true) {
      const line = this.readLine(ctx, section === "[STRINGS]");
      if (line === null) return;
      const stripped = line.replace(/^[ \t]+/, "");
      if (stripped.startsWith("#")) {
        this.comment(stripped);
        continue;
      }
      if (stripped.trim() === "") {
        section = tag = null;
        continue;
      }
      if (section !== null) this.parseLine(ctx, section, stripped, tag);
      else {
        const word = stripped.split(/\s+/, 1)[0]!;
        if (word.toUpperCase() === "[STRINGS]" && !this.allowExtendedStrings) {
          section = null;
          continue;
        }
        section = word;
        tag = this.startSection(ctx, word, stripped);
      }
    }
  }

  private getChar(ctx: Ctx): number {
    if (ctx.pos >= ctx.data.length) return -1;
    const ch = ctx.data[ctx.pos]!;
    ctx.pos++;
    if (ch === "\n") ctx.line++;
    return ch.charCodeAt(0);
  }

  private readLine(ctx: Ctx, extended: boolean): string | null {
    if (ctx.pos >= ctx.data.length) return null;
    let parts = "";
    while (true) {
      let buf = "";
      while (ctx.pos < ctx.data.length) {
        const ch = ctx.data[ctx.pos]!;
        ctx.pos++;
        if (ch === "\n") {
          ctx.line++;
          break;
        }
        if (ch !== "\r") buf += ch;
      }
      if (extended && buf.endsWith("\\")) {
        parts += buf.slice(0, -1) + "\n";
        if (ctx.pos >= ctx.data.length) break;
        continue;
      }
      parts += buf;
      break;
    }
    return parts;
  }

  private comment(comment: string): void {
    if (comment.includes("*allow-long-strings*")) this.allowLongStrings = true;
    if (comment.includes("*allow-long-cheats*")) this.allowLongCheats = true;
    if (comment.includes("*allow-extended-strings*")) this.allowExtendedStrings = true;
  }

  private startSection(ctx: Ctx, word: string, line: string): number | null {
    const key = word.toLowerCase();
    if (key === "thing" || key === "ammo") {
      const tok = line.trim().split(/\s+/);
      return tok[1] !== undefined ? parseInt(tok[1], 10) : null;
    }
    if (key === "text") this.parseText(ctx, line);
    return null;
  }

  private parseLine(ctx: Ctx, section: string, line: string, tag: number | null): void {
    const key = section.toLowerCase();
    if (key === "misc") this.parseMisc(line);
    else if (key === "thing") this.parseThing(line, tag);
    else if (key === "ammo") this.parseAmmo(line, tag);
    else if (key === "cheat") this.parseCheat(line);
    else if (key === "[strings]") this.parseBex(line);
  }

  private assignment(line: string): [string, string] | null {
    const eq = line.indexOf("=");
    if (eq < 0) return null;
    return [line.slice(0, eq).trim(), line.slice(eq + 1).trim()];
  }

  private parseMisc(line: string): void {
    const asg = this.assignment(line);
    if (!asg) return;
    const value = parseInt(asg[1], 10) || 0;
    if (asg[0].toLowerCase() === "monsters infight") {
      this.speciesInfighting = value === 221 ? 1 : 0;
      return;
    }
    for (const [label, field] of Object.entries(MISC)) {
      if (label.toLowerCase() === asg[0].toLowerCase()) {
        (this as unknown as Record<string, number>)[field] = value;
        return;
      }
    }
  }

  private parseThing(line: string, tag: number | null): void {
    const asg = this.assignment(line);
    if (!asg || tag === null || asg[0].toLowerCase() !== "hit points") return;
    const doomed = THING_DOOMED[tag];
    if (doomed === undefined) return;
    this.thingHp[doomed] = parseInt(asg[1], 10) || 0;
  }

  private parseAmmo(line: string, tag: number | null): void {
    const asg = this.assignment(line);
    if (!asg || tag === null || tag < 0 || tag > 3) return;
    const value = parseInt(asg[1], 10) || 0;
    if (asg[0].toLowerCase() === "max ammo") this.maxammo[tag] = value;
    else if (asg[0].toLowerCase() === "per ammo") this.clipammo[tag] = value;
  }

  private parseCheat(line: string): void {
    const asg = this.assignment(line);
    if (!asg || !this.applyCheats) return;
    const cheat = this.cheats.find((item) => item.dehName === asg[0].toLowerCase());
    if (!cheat) return;
    let seq = "";
    for (let i = 0; i < asg[1].length; i++) {
      const code = asg[1].charCodeAt(i);
      if (code === 0 || code === 0xff) break;
      if (!this.allowLongCheats && i + 1 > cheat.sequence.length) break;
      seq += asg[1][i]!;
    }
    cheat.sequence = seq;
    cheat.charsRead = 0;
    cheat.paramBuf = "";
  }

  private parseBex(line: string): void {
    const asg = this.assignment(line);
    if (!asg) return;
    const original = BEX[asg[0].toUpperCase()];
    if (original === undefined) return;
    this.replacements[original] = asg[1].replace(/\\n/g, "\n");
  }

  private parseText(ctx: Ctx, line: string): void {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 3) return;
    const nFrom = parseInt(parts[1]!, 10) || 0;
    const nTo = parseInt(parts[2]!, 10) || 0;
    let src = "";
    let dst = "";
    for (let i = 0; i < nFrom; i++) {
      const code = this.getChar(ctx);
      if (code < 0) break;
      src += String.fromCharCode(code);
    }
    for (let i = 0; i < nTo; i++) {
      const code = this.getChar(ctx);
      if (code < 0) break;
      dst += String.fromCharCode(code);
    }
    this.replacements[src] = dst;
  }
}

export const deh = new Deh();
export function dehString(text: string): string {
  return deh.string(text);
}

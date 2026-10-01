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

import { GS_LEVEL, HU_FONTEND, HU_FONTSTART, LOADSAVEEMPTY, SAVESTRINGSIZE } from "./defs.ts";
import type { Game } from "./game.ts";
import { BACKSPACE, DOWN, ESC, F1, F2, F3, isMinus, isPlus, KP_ENTER, LEFT, RETURN, RIGHT, UP } from "./keys.ts";
import { Saveg } from "./saveg.ts";
import type { Sound } from "./sound.ts";
import { drawPatch, patchSize } from "./vvideo.ts";
import type { Wad } from "./wad.ts";

export class MenuItem {
  constructor(
    public status: number,
    public name: string,
    public action: string,
    public alpha = 0,
  ) {}
}

export class MenuDef {
  constructor(
    public items: MenuItem[],
    public routine: string,
    public x: number,
    public y: number,
    public lastOn = 0,
    public previous: string | null = null,
  ) {}
}

export class Menu {
  private static readonly LINE_HEIGHT = 16;
  private wad: Wad;
  private sound: Sound;
  private game: Game;
  active = false;
  private screen = "main";
  private itemOn = 0;
  private skull = 0;
  private skullTics = 8;
  private episode = 0;
  private message: string | null = null;
  private confirm = false;
  private messageAction: string | null = null;
  private saveStrings: string[];
  private saveOk: boolean[];
  private enteringSave = false;
  private saveSlot = 0;
  private oldSave = "";
  private saveIndex = 0;
  private menus: Record<string, MenuDef>;

  constructor(wad: Wad, sound: Sound, game: Game) {
    this.wad = wad;
    this.sound = sound;
    this.game = game;
    this.saveStrings = new Array(6).fill(LOADSAVEEMPTY);
    this.saveOk = new Array(6).fill(false);
    const items = (rows: Array<[number, string, string]>): MenuItem[] =>
      rows.map((r) => new MenuItem(r[0], r[1], r[2], 0));
    const loadItems = Array.from({ length: 6 }, () => new MenuItem(1, "", "loadslot"));
    const saveItems = Array.from({ length: 6 }, () => new MenuItem(1, "", "saveslot"));
    this.menus = {
      main: new MenuDef(
        items([
          [1, "M_NGAME", "newgame"],
          [1, "M_OPTION", "options"],
          [1, "M_LOADG", "loadgame"],
          [1, "M_SAVEG", "savegame"],
          [1, "M_RDTHIS", "readthis"],
          [1, "M_QUITG", "quit"],
        ]),
        "main",
        97,
        64,
      ),
      episode: new MenuDef(
        items([
          [1, "M_EPI1", "episode"],
          [1, "M_EPI2", "episode"],
          [1, "M_EPI3", "episode"],
          [1, "M_EPI4", "episode"],
        ]),
        "episode",
        48,
        63,
        0,
        "main",
      ),
      skill: new MenuDef(
        items([
          [1, "M_JKILL", "skill"],
          [1, "M_ROUGH", "skill"],
          [1, "M_HURT", "skill"],
          [1, "M_ULTRA", "skill"],
          [1, "M_NMARE", "skill"],
        ]),
        "skill",
        48,
        63,
        2,
        "episode",
      ),
      options: new MenuDef(
        items([
          [1, "M_ENDGAM", "endgame"],
          [1, "M_MESSG", "messages"],
          [1, "M_DETAIL", "detail"],
          [2, "M_SCRNSZ", "scrnsize"],
          [-1, "", ""],
          [2, "M_MSENS", "mousesens"],
          [-1, "", ""],
          [1, "M_SVOL", "sound"],
        ]),
        "options",
        60,
        37,
        0,
        "main",
      ),
      sound: new MenuDef(
        items([
          [2, "M_SFXVOL", "sfxvol"],
          [-1, "", ""],
          [2, "M_MUSVOL", "musvol"],
          [-1, "", ""],
        ]),
        "sound",
        80,
        64,
        0,
        "options",
      ),
      load: new MenuDef(loadItems, "load", 80, 54, 0, "main"),
      save: new MenuDef(saveItems, "save", 80, 54, 0, "main"),
      read1: new MenuDef([new MenuItem(1, "", "read2")], "read1", 280, 185, 0, "main"),
      read2: new MenuDef([new MenuItem(1, "", "finishread")], "read2", 330, 175, 0, "read1"),
    };
    if (!this.hasEpisodes()) this.menus["skill"]!.previous = "main";
  }

  ticker(): void {
    if (this.active && --this.skullTics <= 0) {
      this.skull ^= 1;
      this.skullTics = 8;
    }
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    this.screen = "main";
    this.itemOn = this.menus["main"]!.lastOn;
    this.message = null;
    this.enteringSave = false;
    this.sound.play("swtchn");
  }

  clear(): void {
    this.active = false;
    this.message = null;
    this.enteringSave = false;
  }

  responder(key: number, char = ""): boolean {
    if (this.enteringSave) return this.saveStringKey(key, char);
    if (this.message !== null) {
      if (this.confirm) {
        if ([("y").charCodeAt(0), RETURN, KP_ENTER].includes(key)) {
          const action = this.messageAction;
          this.message = null;
          if (action === "quit") this.game.running = false;
          else if (action === "endgame") this.game.returnToTitle();
        } else if ([("n").charCodeAt(0), ESC].includes(key)) {
          this.message = null;
        }
        return true;
      }
      if (key !== 0) this.message = null;
      return true;
    }
    if (key === F2) {
      this.action("savegame", 0);
      return true;
    }
    if (key === F3) {
      this.action("loadgame", 0);
      return true;
    }
    if (key === F1) {
      this.openHelp();
      return true;
    }
    if (!this.active) {
      if (key === ESC) {
        this.start();
        return true;
      }
      if (
        (isMinus(key) || isPlus(key) || ["+", "=", "-", "_"].includes(char)) &&
        !this.game.automap.active
      ) {
        this.game.sizeDisplay(isPlus(key) || char === "+" || char === "=" ? 1 : 0);
        return true;
      }
      return false;
    }
    const menu = this.menus[this.screen]!;
    if (key === ESC) {
      menu.lastOn = this.itemOn;
      this.clear();
      this.sound.play("swtchx");
      return true;
    }
    if (key === BACKSPACE) {
      menu.lastOn = this.itemOn;
      if (menu.previous !== null) this.go(menu.previous);
      else this.clear();
      this.sound.play("swtchx");
      return true;
    }
    if (key === UP || key === DOWN) {
      const step = key === DOWN ? 1 : -1;
      const count = menu.items.length;
      do {
        this.itemOn = (this.itemOn + step + count) % count;
      } while (menu.items[this.itemOn]!.status === -1);
      this.sound.play("pstop");
      return true;
    }
    if (key === LEFT || key === RIGHT || isMinus(key) || isPlus(key)) {
      const item = menu.items[this.itemOn]!;
      if (item.status === 2) {
        this.sound.play("stnmov");
        this.action(item.action, key === RIGHT || isPlus(key) ? 1 : 0);
        return true;
      }
      if (isMinus(key) || isPlus(key)) return false;
      return true;
    }
    if (key === RETURN || key === KP_ENTER) {
      const item = menu.items[this.itemOn]!;
      if (item.status !== 0) {
        menu.lastOn = this.itemOn;
        this.sound.play("pistol");
        this.action(item.action, item.status === 2 ? 1 : this.itemOn);
      }
      return true;
    }
    return true;
  }

  private action(action: string, choice: number): void {
    switch (action) {
      case "newgame":
        this.episode = 0;
        this.go(this.hasEpisodes() ? "episode" : "skill");
        break;
      case "options":
      case "sound":
        this.go(action);
        break;
      case "loadgame":
        this.openSlots("load");
        break;
      case "savegame":
        if (this.game.gamestate === GS_LEVEL && this.game.player !== null) this.openSlots("save");
        else this.sound.play("oof");
        break;
      case "loadslot":
        if (this.saveOk[choice] && this.game.loadGame(choice)) this.clear();
        else this.sound.play("oof");
        break;
      case "saveslot":
        this.beginSaveName(choice);
        break;
      case "readthis":
        this.go("read1");
        break;
      case "read2":
        this.go(this.has("HELP1") && this.screen === "read1" ? "read2" : "main");
        break;
      case "finishread":
        this.go("main");
        break;
      case "quit":
        this.setConfirm("ARE YOU SURE YOU WANT TO QUIT?", "quit");
        break;
      case "endgame":
        if (this.game.gamestate === GS_LEVEL) this.setConfirm("END GAME?", "endgame");
        else this.sound.play("oof");
        break;
      case "messages":
        this.game.showMessages = !this.game.showMessages;
        this.game.player?.setMessage(this.game.showMessages ? "Messages On" : "Messages Off");
        break;
      case "detail":
        this.game.detailLevel ^= 1;
        this.game.applyViewSize();
        this.game.player?.setMessage(this.game.detailLevel === 0 ? "High detail" : "Low detail");
        break;
      case "scrnsize":
        this.game.sizeDisplay(choice);
        break;
      case "mousesens":
        this.game.mouseSensitivity = Math.max(
          0,
          Math.min(9, this.game.mouseSensitivity + (choice ? 1 : -1)),
        );
        break;
      case "sfxvol":
        this.sound.setSfxVolume(this.sound.sfxVolume + (choice ? 1 : -1));
        break;
      case "musvol":
        this.sound.setMusicVolume(this.sound.musicVolume + (choice ? 1 : -1));
        break;
      case "episode":
        if (!this.has("E2M1") && choice !== 0) {
          this.message = "ONLY AVAILABLE IN THE REGISTERED VERSION.";
          this.confirm = false;
          this.go("read1");
        } else {
          this.episode = choice;
          this.go("skill");
        }
        break;
      case "skill":
        this.game.startNewGame(choice, this.episode + 1, 1);
        this.clear();
        break;
    }
  }

  private setConfirm(message: string, action: string): void {
    this.message = message;
    this.confirm = true;
    this.messageAction = action;
  }

  private openHelp(): void {
    this.active = true;
    this.message = null;
    this.enteringSave = false;
    this.menus["read1"]!.lastOn = 0;
    this.screen = "read1";
    this.itemOn = 0;
    this.sound.play("swtchn");
  }

  private go(screen: string): void {
    this.menus[this.screen]!.lastOn = this.itemOn;
    this.screen = screen;
    this.itemOn = this.menus[screen]!.lastOn;
  }

  private openSlots(screen: string): void {
    for (let i = 0; i < 6; ++i) {
      const [description, ok] = Saveg.readSlotDescription(this.game, i);
      this.saveStrings[i] = description;
      this.saveOk[i] = ok;
      this.menus["load"]!.items[i]!.status = ok ? 1 : 0;
      this.menus["save"]!.items[i]!.status = 1;
    }
    this.message = null;
    this.enteringSave = false;
    if (!this.active) {
      this.active = true;
      this.screen = screen;
      this.itemOn = this.menus[screen]!.lastOn;
    } else {
      this.go(screen);
    }
    this.sound.play("swtchn");
  }

  private beginSaveName(slot: number): void {
    this.enteringSave = true;
    this.saveSlot = slot;
    this.oldSave = this.saveStrings[slot]!;
    if (this.saveStrings[slot] === LOADSAVEEMPTY) this.saveStrings[slot] = "";
    this.saveIndex = this.saveStrings[slot]!.length;
  }

  private saveStringKey(key: number, char: string): boolean {
    const slot = this.saveSlot;
    if (key === BACKSPACE) {
      if (this.saveIndex > 0) this.saveStrings[slot] = this.saveStrings[slot]!.slice(0, --this.saveIndex);
      return true;
    }
    if (key === ESC) {
      this.enteringSave = false;
      this.saveStrings[slot] = this.oldSave;
      return true;
    }
    if (key === RETURN || key === KP_ENTER) {
      this.enteringSave = false;
      if (this.saveStrings[slot] !== "") {
        if (this.game.saveGame(slot, this.saveStrings[slot]!)) this.clear();
        else this.sound.play("oof");
      } else {
        this.saveStrings[slot] = this.oldSave;
      }
      return true;
    }
    char = char.toUpperCase();
    if (char.length !== 1) return true;
    const code = char.charCodeAt(0);
    if (char !== " " && (code < HU_FONTSTART || code > HU_FONTEND)) return true;
    if (
      code >= 32 &&
      code <= 127 &&
      this.saveIndex < SAVESTRINGSIZE - 1 &&
      this.stringWidth(this.saveStrings[slot]!) < (SAVESTRINGSIZE - 2) * 8
    ) {
      this.saveStrings[slot] += char;
      ++this.saveIndex;
    }
    return true;
  }

  draw(fb: Uint8Array): void {
    if (!this.active) return;
    if (this.message !== null) {
      this.writeText(fb, 10, 80, this.message + (this.confirm ? "  (Y/N)" : ""));
      return;
    }
    const menu = this.menus[this.screen]!;
    const headers: Record<string, [string, number, number]> = {
      main: ["M_DOOM", 94, 2],
      skill: ["M_NEWG", 96, 14],
      episode: ["M_EPISOD", 54, 38],
      options: ["M_OPTTTL", 108, 15],
      sound: ["M_SVOL", 60, 38],
      load: ["M_LOADG", 72, 28],
      save: ["M_SAVEG", 72, 28],
    };
    let name: string | undefined;
    let hx = 0;
    let hy = 0;
    const h = headers[menu.routine];
    if (h) [name, hx, hy] = h;
    if (name !== undefined) {
      const patch = this.patch(name);
      if (patch !== null) drawPatch(fb, hx, hy, patch);
    }
    if (menu.routine === "read1" || menu.routine === "read2") {
      const rname =
        menu.routine === "read2"
          ? "HELP1"
          : this.has("HELP2")
            ? "HELP2"
            : this.has("HELP1")
              ? "HELP1"
              : this.has("HELP")
                ? "HELP"
                : "CREDIT";
      const patch = this.patch(rname);
      if (patch !== null) drawPatch(fb, 0, 0, patch);
    } else if (menu.routine === "load" || menu.routine === "save") {
      this.drawSlots(fb, menu);
    } else {
      for (let i = 0; i < menu.items.length; ++i) {
        const item = menu.items[i]!;
        if (item.name !== "") {
          const patch = this.patch(item.name);
          if (patch !== null) drawPatch(fb, menu.x, menu.y + i * Menu.LINE_HEIGHT, patch);
        }
      }
    }
    if (menu.routine === "options") {
      const msg = this.game.showMessages ? "M_MSGON" : "M_MSGOFF";
      const pm = this.patch(msg);
      if (pm !== null) drawPatch(fb, menu.x + 120, menu.y + Menu.LINE_HEIGHT, pm);
      const det = this.game.detailLevel === 0 ? "M_GDHIGH" : "M_GDLOW";
      const pd = this.patch(det);
      if (pd !== null) drawPatch(fb, menu.x + 175, menu.y + Menu.LINE_HEIGHT * 2, pd);
      this.thermo(fb, menu.x, menu.y + 64, 9, this.game.screenSize);
      this.thermo(fb, menu.x, menu.y + 96, 10, this.game.mouseSensitivity);
    } else if (menu.routine === "sound") {
      this.thermo(fb, menu.x, menu.y + 16, 16, this.sound.sfxVolume);
      this.thermo(fb, menu.x, menu.y + 48, 16, this.sound.musicVolume);
    }
    if (!["read1", "read2"].includes(menu.routine)) {
      const patch = this.patch(this.skull ? "M_SKULL2" : "M_SKULL1");
      if (patch !== null) drawPatch(fb, menu.x - 32, menu.y - 5 + this.itemOn * 16, patch);
    }
  }

  private hasEpisodes(): boolean {
    return !this.has("MAP01") && this.has("E2M1");
  }

  private has(name: string): boolean {
    return this.wad.checkNumForName(name) >= 0;
  }

  private patch(name: string): Buffer | null {
    const n = this.wad.checkNumForName(name);
    return n < 0 ? null : this.wad.cacheLumpNum(n);
  }

  private drawSlots(fb: Uint8Array, menu: MenuDef): void {
    for (let i = 0; i < 6; ++i) {
      const y = menu.y + 16 * i;
      let x = menu.x;
      const names = ["M_LSLEFT", ...new Array(SAVESTRINGSIZE).fill("M_LSCNTR"), "M_LSRGHT"];
      for (let j = 0; j < names.length; ++j) {
        const p = this.patch(names[j]!);
        if (p !== null) drawPatch(fb, x - (j === 0 ? 8 : 0), y + 7, p);
        if (j > 0) x += 8;
      }
      const end = this.writeText(fb, menu.x, y, this.saveStrings[i]!);
      if (this.enteringSave && i === this.saveSlot) this.writeText(fb, end, y, "_");
    }
  }

  private thermo(fb: Uint8Array, x: number, y: number, width: number, dot: number): void {
    const names = ["M_THERML", ...new Array(width).fill("M_THERMM"), "M_THERMR"];
    for (const name of names) {
      const p = this.patch(name);
      if (p !== null) drawPatch(fb, x, y, p);
      x += 8;
    }
    const po = this.patch("M_THERMO");
    if (po !== null) {
      drawPatch(fb, x - (width + 2) * 8 + 8 + Math.max(0, Math.min(width - 1, dot)) * 8, y, po);
    }
  }

  private stringWidth(text: string): number {
    return this.writeText(null, 0, 0, text);
  }

  private writeText(fb: Uint8Array | null, x: number, y: number, text: string): number {
    for (const char of text.toUpperCase()) {
      const patch = char === " " ? null : this.patch(`STCFN${String(char.charCodeAt(0)).padStart(3, "0")}`);
      if (patch !== null) {
        if (fb !== null) drawPatch(fb, x, y, patch);
        const [width] = patchSize(patch);
        x += Math.max(4, width);
      } else {
        x += char === " " ? 4 : 8;
      }
      if (fb !== null && x > 300) {
        x = 10;
        y += 10;
      }
    }
    return x;
  }
}

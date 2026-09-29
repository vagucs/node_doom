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
import path from "node:path";
import { fileURLToPath } from "node:url";

import { AmMap } from "./ammap.ts";
import { Collision } from "./collision.ts";
import { asU32, fixedMul, intdiv } from "./compat.ts";
import {
  BT_ATTACK,
  BT_CHANGE,
  BT_USE,
  BT_WEAPONSHIFT,
  CF_GODMODE,
  CF_NOCLIP,
  FRACUNIT,
  GS_FINALE,
  GS_INTERMISSION,
  GS_LEVEL,
  GS_TITLE,
  MF_NOCLIP,
  MF_SHOOTABLE,
  MF_SOLID,
  PST_DEAD,
  PST_LIVE,
  SK_BABY,
  SK_MEDIUM,
  SK_NIGHTMARE,
  TICRATE,
  WP_BFG,
  WP_CHAINGUN,
  WP_CHAINSAW,
  WP_FIST,
  WP_MISSILE,
  WP_NOCHANGE,
  WP_PISTOL,
  WP_PLASMA,
  WP_SHOTGUN,
} from "./defs.ts";
import { Enemy } from "./enemy.ts";
import { Finale } from "./finale.ts";
import {
  COMMA,
  DOWN,
  F11,
  isMinus,
  isPlus,
  KP_ENTER,
  LALT,
  LCTRL,
  LEFT,
  LSHIFT,
  PERIOD,
  RALT,
  RCTRL,
  RETURN,
  RIGHT,
  RSHIFT,
  SPACE,
  UP,
} from "./keys.ts";
import { Menu } from "./menu.ts";
import { Mobj } from "./mobj.ts";
import { Player, Ticcmd } from "./player.ts";
import { Resources } from "./rdata.ts";
import { Renderer } from "./render.ts";
import { Saveg } from "./saveg.ts";
import { Sound } from "./sound.ts";
import { Specials } from "./specials.ts";
import { Sprites } from "./sprites.ts";
import { Status } from "./status.ts";
import { fineCos, fineSin, initTables } from "./tables.ts";
import { Video } from "./video.ts";
import * as VVideo from "./vvideo.ts";
import { Wad } from "./wad.ts";
import { Wipe } from "./wipe.ts";
import { Intermission, WbStart } from "./wistuff.ts";
import { World } from "./world.ts";

export class Game {
  private static readonly IWADS = [
    "DOOM1.WAD",
    "doom1.wad",
    "DOOM.WAD",
    "doom.wad",
    "DOOM2.WAD",
    "doom2.wad",
    "PLUTONIA.WAD",
    "TNT.WAD",
    "freedoom1.wad",
    "freedoom2.wad",
  ];
  private static readonly WEAPON_PATCH: Record<number, string> = {
    0: "PUNGA0",
    1: "PISGA0",
    2: "SHTGA0",
    3: "CHGGA0",
    4: "MISGA0",
    5: "PLSGA0",
    6: "BFGGA0",
    7: "SAWGA0",
    8: "SHT2A0",
  };
  private static readonly WEAPON_FIRE_BODY: Record<number, string> = {
    0: "PUNGB0",
    1: "PISGB0",
    2: "SHTGB0",
    3: "CHGGB0",
    4: "MISGB0",
    5: "PLSGB0",
    6: "BFGGB0",
    7: "SAWGB0",
    8: "SHT2B0",
  };
  private static readonly WEAPON_FIRE_PATCH: Record<number, string> = {
    1: "PISFA0",
    2: "SHTFA0",
    3: "CHGFA0",
    4: "MISFA0",
    5: "PLSFA0",
    6: "BFGFA0",
    8: "SHT2F0",
  };

  wad: Wad;
  video: Video;
  sound: Sound;
  res: Resources | null = null;
  renderer: Renderer | null = null;
  world: World | null = null;
  specials: Specials | null = null;
  status: Status | null = null;
  player: Player | null = null;
  gamestate = GS_TITLE;
  episode = 1;
  mapn = 1;
  skill = SK_MEDIUM;
  leveltime = 0;
  keys: Record<number, boolean> = {};
  running = true;
  showFps = false;
  nomonsters = false;
  fullscreen = false;
  crt = false;
  iwadPath = "";
  menu: Menu | null = null;
  showMessages = true;
  detailLevel = 0;
  screenSize = 7;
  mouseSensitivity = 5;
  totalkills = 0;
  totalitems = 0;
  totalsecret = 0;
  wi: Intermission | null = null;
  finale: Finale | null = null;
  wipe: Wipe;
  wiping = false;
  forceWipe = false;
  automap: AmMap;
  private turnheld = 0;
  private titlePatch: Buffer | null = null;
  private palette = -1;
  private playpal: Buffer | null = null;
  private wipeState: number | null = GS_TITLE;
  private nextMapNum = 1;
  private cheats: Record<string, number> = {
    iddqd: 0,
    idkfa: 0,
    idfa: 0,
    iddt: 0,
    idclip: 0,
    idspispopd: 0,
  };

  constructor() {
    this.wad = new Wad();
    this.video = new Video();
    this.sound = new Sound();
    this.wipe = new Wipe();
    this.automap = new AmMap();
  }

  startSound(name: string): void {
    this.sound.play(name);
  }
  touchSpecial(special: Mobj, toucher: Mobj): void {
    Mobj.touchSpecial(this, special, toucher);
  }
  useSpecial(line: unknown, thing: Mobj, side: number): void {
    this.specials?.useSpecial(line as never, thing, side);
  }
  crossSpecial(line: unknown, side: number, thing: Mobj): void {
    this.specials?.crossSpecial(line as never, side, thing);
  }

  damageMobj(target: Mobj, source: Mobj | null, damage: number, inflictor: Mobj | null = null): void {
    if (!target.alive || (target.flags & MF_SHOOTABLE) === 0) return;
    if (target.player !== null && this.skill === SK_BABY) damage >>= 1;
    const origin = inflictor ?? source;
    const skipSaw = source?.player != null && source.player.readyweapon === WP_CHAINSAW;
    if (origin !== null && (target.flags & MF_NOCLIP) === 0 && !skipSaw) {
      const angle = Collision.angleTo(origin.x, origin.y, target.x, target.y);
      const thrust = damage * intdiv(FRACUNIT, 8);
      target.momx += fixedMul(thrust, fineCos(angle));
      target.momy += fixedMul(thrust, fineSin(angle));
    }
    if (target.player !== null) {
      const p = target.player;
      if ((p.cheats & CF_GODMODE) !== 0 && damage < 1000) return;
      if (p.armortype) {
        let saved = intdiv(damage, p.armortype === 1 ? 3 : 2);
        if (p.armorpoints <= saved) {
          saved = p.armorpoints;
          p.armortype = 0;
        }
        p.armorpoints -= saved;
        damage -= saved;
      }
      p.health -= damage;
      target.health = p.health;
      p.damagecount = Math.min(100, p.damagecount + damage);
      if (p.health <= 0) {
        p.health = 0;
        p.playerstate = PST_DEAD;
        target.alive = false;
        target.flags &= ~(MF_SOLID | MF_SHOOTABLE);
        this.startSound("pldeth");
      } else this.startSound("plpain");
      return;
    }
    target.health -= damage;
    if (target.health <= 0) Enemy.killMonster(target, this, source);
    else {
      this.startSound("popain");
      if (source !== null) {
        target.target = source;
        if (target.aiState === "" || target.aiState === "look") {
          target.aiState = "chase";
          target.reactiontime = 0;
        }
      }
    }
  }

  loadLevel(carry = false): void {
    if (this.res === null) throw new Error("resources not initialized");
    const previous = carry ? this.player : null;
    this.world = new World();
    this.world.setupLevel(this.wad, this.res, this.episode, this.mapn);
    this.specials = new Specials(this.world, this.res, this.sound);
    const start = this.world.playerStart();
    if (start === null) throw new Error("no player 1 start");
    this.player = Player.spawnPlayer(this.world, start);
    if (previous !== null) this.carryPlayer(previous);
    this.player.killcount = this.player.itemcount = this.player.secretcount = 0;
    this.totalkills = this.totalitems = 0;
    this.totalsecret = this.world.sectors.filter((s) => s.special === 9).length;
    if (!this.nomonsters) [this.totalkills, this.totalitems] = Mobj.spawnMapThings(this.world, this.skill);
    this.leveltime = 0;
    this.gamestate = GS_LEVEL;
    this.specials.exitRequested = false;
    this.specials.secretExit = false;
    this.wi = null;
    this.finale = null;
    this.sound.playLevelMusic(this.episode, this.mapn);
    this.automap.resetLevel();
    process.stdout.write(`Entering E${this.episode}M${this.mapn}\n`);
  }

  private carryPlayer(previous: Player): void {
    const p = this.player!;
    const prev = previous as unknown as Record<string, unknown>;
    const cur = p as unknown as Record<string, unknown>;
    for (const field of [
      "health",
      "armorpoints",
      "armortype",
      "ammo",
      "maxammo",
      "weaponowned",
      "readyweapon",
      "cheats",
      "didsecret",
    ]) {
      const value = prev[field];
      cur[field] = Array.isArray(value) ? value.slice() : value;
    }
    p.mo!.health = p.health;
    p.pendingweapon = WP_NOCHANGE;
    p.pspriteState = "up";
    p.pspriteSy = 128 * FRACUNIT;
    p.pspriteBody = "";
    p.cards = [false, false, false, false, false, false];
    p.damagecount = p.bonuscount = p.extralight = 0;
    p.playerstate = PST_LIVE;
  }

  private commercial(): boolean {
    return this.wad.checkNumForName("MAP01") >= 0;
  }

  completeLevel(): void {
    this.automap.stop();
    const p = this.player;
    if (p !== null) {
      p.cards = [false, false, false, false, false, false];
      p.damagecount = p.bonuscount = p.extralight = 0;
    }
    const secret = this.specials?.secretExit ?? false;
    const commercial = this.commercial();
    if (!commercial && this.mapn === 8) {
      this.finale = new Finale(this);
      this.gamestate = GS_FINALE;
      return;
    }
    if (!commercial && this.mapn === 9 && p !== null) p.didsecret = true;
    let next: number;
    if (commercial) {
      next =
        secret && this.mapn === 15
          ? 30
          : secret && this.mapn === 31
            ? 31
            : this.mapn === 31 || this.mapn === 32
              ? 15
              : this.mapn;
    } else {
      next = secret
        ? 8
        : this.mapn === 9
          ? ({ 1: 3, 2: 5, 3: 6, 4: 2 } as Record<number, number>)[this.episode] ?? 0
          : this.mapn;
    }
    this.nextMapNum = next + 1;
    const wbs = new WbStart(
      this.episode - 1,
      this.mapn - 1,
      next,
      Math.max(1, this.totalkills),
      Math.max(1, this.totalitems),
      Math.max(1, this.totalsecret),
      Intermission.parTime(this.episode, this.mapn, commercial),
      p?.killcount ?? 0,
      p?.itemcount ?? 0,
      p?.secretcount ?? 0,
      this.leveltime,
      Boolean(p?.didsecret ?? false),
      commercial,
    );
    this.wi = new Intermission(this, wbs);
    this.gamestate = GS_INTERMISSION;
  }

  worldDone(): void {
    if ((this.specials?.secretExit ?? false) && this.player !== null) this.player.didsecret = true;
    this.mapn = this.nextMapNum;
    const lump = this.commercial()
      ? `MAP${String(this.mapn).padStart(2, "0")}`
      : `E${this.episode}M${this.mapn}`;
    if (this.wad.checkNumForName(lump) < 0) {
      this.returnToTitle();
      return;
    }
    this.loadLevel(true);
  }

  nextMap(): void {
    this.completeLevel();
  }

  startNewGame(skill: number, episode: number, map: number): void {
    this.skill = skill;
    this.episode = episode;
    this.mapn = map;
    this.loadLevel();
  }

  saveGame(slot: number, description: string): boolean {
    if (this.gamestate !== GS_LEVEL || this.player === null || this.world === null) return false;
    const ok = Saveg.writeSave(this, slot, description);
    if (ok) this.player.setMessage("game saved.");
    return ok;
  }

  loadGame(slot: number): boolean {
    if (!Saveg.readAndRestore(this, slot)) return false;
    this.palette = -1;
    this.keys = {};
    this.automap.resetLevel();
    this.player?.setMessage("game loaded.");
    process.stdout.write(`Loaded E${this.episode}M${this.mapn}\n`);
    return true;
  }

  returnToTitle(): void {
    this.gamestate = GS_TITLE;
    this.player = null;
    this.world = null;
    this.wi = null;
    this.finale = null;
    this.automap.resetLevel();
    this.sound.playTitleMusic();
    this.menu?.clear();
  }

  buildTiccmd(): Ticcmd {
    const cmd = new Ticcmd();
    const speed = this.keys[LSHIFT] || this.keys[RSHIFT] ? 1 : 0;
    const strafe = !!(this.keys[LALT] || this.keys[RALT]);
    const turning = !!(this.keys[RIGHT] || this.keys[LEFT]);
    this.turnheld = turning ? this.turnheld + 1 : 0;
    const turnSpeed = this.turnheld < 6 ? 2 : speed;
    if (strafe) {
      if (this.keys[RIGHT]) cmd.sidemove += Player.SIDEMOVE[speed]!;
      if (this.keys[LEFT]) cmd.sidemove -= Player.SIDEMOVE[speed]!;
    } else {
      if (this.keys[RIGHT]) cmd.angleturn -= Player.ANGLETURN[turnSpeed]!;
      if (this.keys[LEFT]) cmd.angleturn += Player.ANGLETURN[turnSpeed]!;
    }
    if (this.keys[UP]) cmd.forwardmove += Player.FORWARDMOVE[speed]!;
    if (this.keys[DOWN]) cmd.forwardmove -= Player.FORWARDMOVE[speed]!;
    if (this.keys[COMMA]) cmd.sidemove -= Player.SIDEMOVE[speed]!;
    if (this.keys[PERIOD]) cmd.sidemove += Player.SIDEMOVE[speed]!;
    if (this.keys[LCTRL] || this.keys[RCTRL]) cmd.buttons |= BT_ATTACK;
    if (this.keys[SPACE] || this.keys["e".charCodeAt(0)]) cmd.buttons |= BT_USE;
    const weapons: Record<number, number> = {
      2: WP_PISTOL,
      3: WP_SHOTGUN,
      4: WP_CHAINGUN,
      5: WP_MISSILE,
      6: WP_PLASMA,
      7: WP_BFG,
    };
    if (this.keys["1".charCodeAt(0)]) {
      const weapon =
        this.player?.readyweapon === WP_CHAINSAW
          ? WP_FIST
          : this.player?.weaponowned[WP_CHAINSAW] ?? false
            ? WP_CHAINSAW
            : WP_FIST;
      cmd.buttons |= BT_CHANGE | (weapon << BT_WEAPONSHIFT);
    } else {
      for (const numberKey of Object.keys(weapons)) {
        const number = Number(numberKey);
        if (this.keys[String(number).charCodeAt(0)]) {
          cmd.buttons |= BT_CHANGE | (weapons[number]! << BT_WEAPONSHIFT);
          break;
        }
      }
    }
    return cmd;
  }

  runTic(): void {
    if (this.wiping) {
      if (this.wipe.tick(1, this.video.fb)) this.wiping = false;
      return;
    }
    this.menu?.ticker();
    this.sound.update();
    if (this.gamestate === GS_TITLE) return;
    if (this.gamestate === GS_INTERMISSION) {
      this.wi?.ticker();
      if (this.wi?.done) this.worldDone();
      return;
    }
    if (this.gamestate === GS_FINALE) {
      this.finale?.ticker();
      if (this.finale?.done) this.returnToTitle();
      return;
    }
    if (this.gamestate !== GS_LEVEL || this.player === null) return;
    this.player.cmd = this.menu?.active ? new Ticcmd() : this.buildTiccmd();
    Player.playerThink(this.world!, this.player, this, this.leveltime);
    Enemy.tickEnemies(this.world!, this);
    this.specials?.tick();
    if (this.specials?.exitRequested) {
      this.startSound("swtchx");
      this.completeLevel();
      return;
    }
    ++this.leveltime;
    this.automap.ticker(this);
  }

  draw(): void {
    const fb = this.video.fb;
    if (this.wiping) {
      this.menu?.draw(fb);
      this.applyPalette();
      this.video.present();
      return;
    }
    const need = this.forceWipe || this.gamestate !== this.wipeState;
    this.forceWipe = false;
    if (need) this.wipe.captureStart(fb);
    this.drawFrame(fb);
    if (need) {
      this.wipe.captureEnd(fb);
      this.wipe.begin(fb);
      this.wipeState = this.gamestate;
      this.wiping = true;
    }
    this.menu?.draw(fb);
    if (this.video.showFps && this.status !== null) {
      this.status.drawText(fb, 250, 1, `${this.video.fpsValue} FPS`);
    }
    this.applyPalette();
    this.video.present();
  }

  private drawFrame(fb: Uint8Array): void {
    if (this.gamestate === GS_TITLE && this.titlePatch !== null) {
      VVideo.fill(fb, 0);
      VVideo.drawPatch(fb, 0, 0, this.titlePatch);
      return;
    }
    if (this.gamestate === GS_INTERMISSION && this.wi !== null) {
      this.wi.draw(fb);
      return;
    }
    if (this.gamestate === GS_FINALE && this.finale !== null) {
      this.finale.draw(fb);
      return;
    }
    if (this.gamestate !== GS_LEVEL || this.player === null) {
      VVideo.fill(fb, 0);
      return;
    }
    if (this.automap.active) this.automap.draw(fb, this);
    else {
      const mo = this.player.mo!;
      VVideo.fill(fb, 0);
      this.renderer!.setupFrame(mo.x, mo.y, this.player.viewz, mo.angle, this.player.extralight);
      this.renderer!.render(this.world!, fb);
      Sprites.drawSprites(this.renderer!, this.world!, fb);
      this.renderer!.drawMasked();
      this.drawWeapon(fb);
    }
    if (this.status !== null && (this.automap.active || this.renderer!.screenblocks < 11)) {
      this.status.draw(fb, this.player, this.showMessages);
    }
  }

  private applyPalette(): void {
    let palette = 0;
    const p = this.player;
    if (p !== null && this.gamestate === GS_LEVEL) {
      if (p.damagecount) palette = Math.min(7, (p.damagecount + 7) >> 3) + 1;
      else if (p.bonuscount) palette = Math.min(3, (p.bonuscount + 7) >> 3) + 9;
    }
    if (palette === this.palette) return;
    this.palette = palette;
    if (this.playpal !== null) {
      const raw = this.playpal.subarray(palette * 768, palette * 768 + 768);
      if (raw.length === 768) this.video.setPaletteRaw(raw);
    }
  }

  private drawWeapon(fb: Uint8Array): void {
    const player = this.player!;
    const [x, y] = Sprites.weaponPspriteXY(player, this.leveltime);
    const body =
      player.pspriteBody ||
      ((player.pspriteState === "atk" || player.pspriteState === "fire"
        ? Game.WEAPON_FIRE_BODY[player.readyweapon] ?? null
        : null) ??
        Game.WEAPON_PATCH[player.readyweapon] ??
        "PISGA0");
    let n = this.wad.checkNumForName(body);
    if (n < 0) n = this.wad.checkNumForName("PISGA0");
    if (n >= 0) Sprites.drawPsprite(this.renderer!, fb, this.wad.cacheLumpNum(n), x, y);
    let flash = player.flashTics > 0 ? player.pspriteFlash : "";
    if (flash === "" && player.pspriteState === "fire") flash = Game.WEAPON_FIRE_PATCH[player.readyweapon] ?? "";
    if (flash !== "") {
      const fn = this.wad.checkNumForName(flash);
      if (fn >= 0) Sprites.drawPsprite(this.renderer!, fb, this.wad.cacheLumpNum(fn), x, y);
    }
  }

  applyViewSize(): void {
    this.renderer?.setViewSize(this.screenSize + 3, this.detailLevel);
  }

  sizeDisplay(choice: number): void {
    const next = Math.max(0, Math.min(8, this.screenSize + (choice ? 1 : -1)));
    if (next === this.screenSize) {
      return;
    }
    this.screenSize = next;
    this.applyViewSize();
    this.startSound("stnmov");
  }

  handleEvent(type: string, key = 0, unicodeChar = ""): void {
    if (type === "quit") {
      this.running = false;
      return;
    }
    if (type === "keydown") {
      if (key === LALT || key === RALT || key === LSHIFT || key === RSHIFT || key === LCTRL || key === RCTRL) {
        this.keys[key] = true;
      }
      if ((key === RETURN || key === KP_ENTER) && (this.keys[LALT] || this.keys[RALT])) {
        this.video.toggleFullscreen();
        this.fullscreen = this.video.fullscreen;
        return;
      }
      if (this.menu?.responder(key, unicodeChar)) return;
      if (this.automap.responder(type, key, this)) return;
      if (isPlus(key) || isMinus(key) || ["+", "=", "-", "_"].includes(unicodeChar)) {
        if (!this.automap.active) {
          const plus = isPlus(key) || unicodeChar === "+" || unicodeChar === "=";
          this.sizeDisplay(plus ? 1 : 0);
        }
        return;
      }
      this.keys[key] = true;
      if ((key === RETURN || key === KP_ENTER) && this.gamestate === GS_TITLE) this.loadLevel();
      else if (key === F11) this.video.showFps = !this.video.showFps;
      else this.feedCheat(unicodeChar);
    } else if (type === "keyup") {
      delete this.keys[key];
      this.automap.responder(type, key, this);
    }
  }

  private feedCheat(input: string): void {
    if (this.gamestate !== GS_LEVEL || this.player === null || this.skill === SK_NIGHTMARE) return;
    const char = input.toLowerCase();
    if (char.length !== 1 || !/[a-z]/.test(char)) return;
    for (const sequence of Object.keys(this.cheats)) {
      let position = this.cheats[sequence]!;
      if (char === (sequence[position] ?? "")) {
        if (++position >= sequence.length) {
          this.cheats[sequence] = 0;
          switch (sequence) {
            case "iddqd":
              this.cheatGod();
              break;
            case "idkfa":
              this.cheatAmmo(true);
              break;
            case "idfa":
              this.cheatAmmo(false);
              break;
            case "iddt":
              if (this.automap.active) this.automap.cycleIddt();
              break;
            case "idclip":
            case "idspispopd":
              this.cheatNoclip();
              break;
          }
        } else this.cheats[sequence] = position;
      } else this.cheats[sequence] = char === sequence[0] ? 1 : 0;
    }
  }

  private cheatGod(): void {
    const p = this.player!;
    p.cheats ^= CF_GODMODE;
    if ((p.cheats & CF_GODMODE) !== 0) {
      p.health = 100;
      p.mo!.health = 100;
      p.setMessage("Degreelessness Mode On");
    } else p.setMessage("Degreelessness Mode Off");
  }

  private cheatAmmo(keys: boolean): void {
    const p = this.player!;
    p.armorpoints = 200;
    p.armortype = 2;
    p.weaponowned = new Array(p.weaponowned.length).fill(true);
    for (let i = 0; i < p.ammo.length; ++i) p.ammo[i] = p.maxammo[i]!;
    if (keys) p.cards = [true, true, true, true, true, true];
    p.setMessage(keys ? "Very Happy Ammo Added" : "Ammo Added");
  }

  private cheatNoclip(): void {
    const p = this.player!;
    p.cheats ^= CF_NOCLIP;
    if ((p.cheats & CF_NOCLIP) !== 0) p.mo!.flags |= MF_NOCLIP;
    else p.mo!.flags &= ~MF_NOCLIP;
    p.setMessage((p.cheats & CF_NOCLIP) !== 0 ? "No Clipping Mode ON" : "No Clipping Mode OFF");
  }

  static main(argv: string[]): number {
    try {
      const game = new Game();
      const iwad = Game.parseArgs(argv, game);
      const iwadPath = Game.findIwad(iwad);
      game.iwadPath = iwadPath;
      process.stdout.write(`IWAD: ${iwadPath}\n`);
      game.wad.addFile(iwadPath);
      initTables();
      game.res = new Resources(game.wad);
      game.res.init();
      game.renderer = new Renderer(game.res);
      game.applyViewSize();
      game.video.init(game.fullscreen, "DOOM (Node)");
      game.video.showFps = game.showFps;
      game.video.crt = game.crt;
      game.playpal = game.wad.cacheLumpName("PLAYPAL");
      game.video.setPalette(game.playpal);
      game.sound.init(game.wad);
      game.sound.output = game.video;
      game.menu = new Menu(game.wad, game.sound, game);
      if (game.wad.checkNumForName("TITLEPIC") >= 0) game.titlePatch = game.wad.cacheLumpName("TITLEPIC");
      game.status = new Status(game.wad);
      if (argv.includes("-warp")) game.loadLevel();
      else {
        game.startSound("swtchn");
        game.sound.playTitleMusic();
      }
      const tickMs = 1000 / TICRATE;
      let accum = 0;
      let last = game.video.ticksMs();
      while (game.running) {
        for (const event of game.video.pollEvents())
          game.handleEvent(event.type, event.key ?? event.sym ?? 0, event.text ?? "");
        const now = game.video.ticksMs();
        accum += now - last;
        last = now;
        while (accum >= tickMs) {
          game.runTic();
          accum -= tickMs;
        }
        game.draw();
        if (accum < tickMs / 2) Game.usleep(1);
      }
      game.sound.stopMusic();
      game.video.shutdown();
      return 0;
    } catch (exception) {
      process.stderr.write(`${(exception as Error).message}\n`);
      return 1;
    }
  }

  private static usleep(ms: number): void {
    const shared = new Int32Array(new SharedArrayBuffer(4));
    Atomics.wait(shared, 0, 0, ms);
  }

  private static parseArgs(argv: string[], game: Game): string | null {
    let iwad: string | null = null;
    for (let i = 1, n = argv.length; i < n; ++i) {
      const arg = argv[i]!;
      if (arg === "-iwad" && argv[i + 1] !== undefined) {
        iwad = argv[++i]!;
      } else if (arg === "-fps") game.showFps = true;
      else if (arg === "-nomonsters") game.nomonsters = true;
      else if (arg === "-warp" && argv[i + 2] !== undefined) {
        game.episode = parseInt(argv[++i]!, 10) || 0;
        game.mapn = parseInt(argv[++i]!, 10) || 0;
      } else if (arg === "-skill" && argv[i + 1] !== undefined) game.skill = parseInt(argv[++i]!, 10) || 0;
      else if (arg === "-fullscreen") game.fullscreen = true;
      else if (arg === "-crt") game.crt = true;
      else if (!arg.startsWith("-") && arg.toLowerCase().endsWith(".wad")) iwad = arg;
    }
    return iwad;
  }

  private static findIwad(explicit: string | null): string {
    if (explicit !== null) {
      if (Game.isFile(explicit)) return Game.realpath(explicit);
      throw new Error(`IWAD not found: ${explicit}`);
    }
    const here = path.dirname(fileURLToPath(import.meta.url));
    let roots = [process.cwd(), here, path.dirname(here), path.dirname(path.dirname(here))];
    const env = process.env.DOOMWADDIR || process.env.DOOMWADPATH;
    if (env) roots = env.split(path.delimiter).concat(roots);
    for (const root of roots)
      for (const name of Game.IWADS) {
        const full = path.join(root, name);
        if (Game.isFile(full)) return Game.realpath(full);
      }
    throw new Error("No IWAD found. Put doom1.wad in this folder or pass -iwad file.wad");
  }

  private static isFile(p: string): boolean {
    try {
      return fs.statSync(p).isFile();
    } catch {
      return false;
    }
  }

  private static realpath(p: string): string {
    try {
      return fs.realpathSync(p);
    } catch {
      return p;
    }
  }
}

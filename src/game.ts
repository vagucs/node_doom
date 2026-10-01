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
import { load as loadConfig, save as saveConfig } from "./config.ts";
import { deh } from "./deh.ts";
import {
  ANG180,
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
  MF_JUSTHIT,
  MF_NOCLIP,
  MF_SKULLFLY,
  MF_SHOOTABLE,
  MF_SOLID,
  PST_DEAD,
  PST_LIVE,
  PST_REBORN,
  PW_INVULNERABILITY,
  PW_IRONFEET,
  PW_STRENGTH,
  RADIATIONPAL,
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
import { commercialFinaleMap, Finale } from "./finale.ts";
import {
  MI_MASS,
  MI_PAINCHANCE,
  MI_PAINSTATE,
  MI_SEESTATE,
  MI_SPAWNSTATE,
  MOBJINFO,
} from "./info.ts";
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
import { Thinker } from "./thinker.ts";
import { type GameEvent, Video } from "./video.ts";
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
  fastparm = false;
  respawnparm = false;
  respawnmonsters = false;
  _fastOn: boolean | null = null;
  fullscreen = false;
  crt = false;
  iwadPath = "";
  menu: Menu | null = null;
  showMessages = true;
  detailLevel = 0;
  screenSize = 7;
  mouseSensitivity = 5;
  useMouse = true;
  mouseX = 0;
  mouseY = 0;
  mouseFire = false;
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
  private creditPatch: Buffer | null = null;
  private pagePatch: Buffer | null = null;
  private pageTic = 0;
  private demoSequence = -1;
  private advancedemo = false;
  demoPlayback = false;
  demoRecording = false;
  demoName = "";
  singledemo = false;
  timingdemo = false;
  timedemoStart = 0;
  gametic = 0;
  pwadFiles: string[] = [];
  recordName: string | null = null;
  playdemoName: string | null = null;
  timedemoName: string | null = null;
  nosound = false;
  nomusic = false;
  private demoBuffer: Buffer | null = null;
  private demoP = 0;
  private static readonly DEMOMARKER = 0x80;
  private palette = -1;
  private playpal: Buffer | null = null;
  private wipeState: number | null = GS_TITLE;
  private nextMapNum = 1;

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
  shootSpecial(line: unknown, thing: Mobj): void {
    this.specials?.shootSpecial(line as never, thing);
  }

  damageMobj(target: Mobj, source: Mobj | null, damage: number, inflictor: Mobj | null = null): void {
    if (!target.alive || (target.flags & MF_SHOOTABLE) === 0) return;
    if (target.player !== null && this.skill === SK_BABY) damage >>= 1;
    const origin = inflictor ?? source;
    const skipSaw = source?.player != null && source.player.readyweapon === WP_CHAINSAW;
    if (origin !== null && (target.flags & MF_NOCLIP) === 0 && !skipSaw) {
      let angle = Collision.angleTo(origin.x, origin.y, target.x, target.y);
      const mass = Number(MOBJINFO[target.type]![MI_MASS]) || 100;
      let thrust = intdiv(damage * intdiv(FRACUNIT, 8) * 100, mass);
      if (
        damage < 40 &&
        damage > target.health &&
        target.z - origin.z > 64 * FRACUNIT &&
        (Enemy.publicRandom() & 1)
      ) {
        angle = asU32(angle + ANG180);
        thrust *= 4;
      }
      target.momx += fixedMul(thrust, fineCos(angle));
      target.momy += fixedMul(thrust, fineSin(angle));
    }
    if (target.player !== null) {
      const p = target.player;
      if (((p.cheats & CF_GODMODE) !== 0 || p.powers[PW_INVULNERABILITY]) && damage < 1000) return;
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
      p.attacker = source;
      if (p.health <= 0) {
        p.health = 0;
        p.playerstate = PST_DEAD;
        target.alive = false;
        target.flags &= ~(MF_SOLID | MF_SHOOTABLE);
        this.startSound("pldeth");
      } else {
        this.startSound("plpain");
        this.painOrWake(target, source);
      }
      return;
    }
    target.health -= damage;
    if (target.health <= 0) {
      Enemy.killMonster(target, this, source);
      return;
    }
    this.painOrWake(target, source);
  }

  private painOrWake(target: Mobj, source: Mobj | null): void {
    const info = MOBJINFO[target.type];
    if (Enemy.publicRandom() < Number(info![MI_PAINCHANCE]) && (target.flags & MF_SKULLFLY) === 0) {
      target.flags |= MF_JUSTHIT;
      const painState = Number(info![MI_PAINSTATE]);
      if (painState) Thinker.setMobjState(target, painState, this.world!, this);
    }
    target.reactiontime = 0;
    if (source !== null && source !== target && target.player === null) {
      target.target = source;
      const seeState = Number(info![MI_SEESTATE]);
      if (target.istate === Number(info![MI_SPAWNSTATE]) && seeState) {
        Thinker.setMobjState(target, seeState, this.world!, this);
      }
    }
  }

  loadLevel(carry = false): void {
    if (this.res === null) throw new Error("resources not initialized");
    const previous = carry ? this.player : null;
    Enemy.clearRandom();
    this.world = new World();
    this.world.setupLevel(this.wad, this.res, this.episode, this.mapn);
    this.specials = new Specials(this.world, this.res, this.sound);
    this.player = null;
    [this.totalkills, this.totalitems] = Mobj.spawnMapThings(this.world, this.skill, this);
    const player = this.player as Player | null;
    if (player === null) throw new Error("no player 1 start");
    this.player = player;
    if (previous !== null) this.carryPlayer(previous);
    this.player.killcount = this.player.itemcount = this.player.secretcount = 0;
    this.totalsecret = this.world.sectors.filter((s) => s.special === 9).length;
    Thinker.applyFast(this);
    this.leveltime = 0;
    this.gamestate = GS_LEVEL;
    this.specials.exitRequested = false;
    this.specials.secretExit = false;
    this.wi = null;
    this.finale = null;
    this.sound.playLevelMusic(this.episode, this.mapn);
    this.automap.resetLevel();
    this.status?.reset(this.player);
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

  worldDone(fromFinale = false): void {
    const secret = this.specials?.secretExit ?? false;
    if (secret && this.player !== null) this.player.didsecret = true;
    if (!fromFinale && this.commercial() && commercialFinaleMap(this.mapn, secret)) {
      this.finale = new Finale(this);
      this.gamestate = GS_FINALE;
      return;
    }
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
    this.demoPlayback = false;
    this.advancedemo = false;
    this.demoBuffer = null;
    this.skill = skill;
    this.episode = episode;
    this.mapn = map;
    this._fastOn = null;
    Thinker.applyFast(this);
    this.loadLevel();
    if (this.demoRecording) this.beginRecording();
  }

  saveGame(slot: number, description: string): boolean {
    if (this.gamestate !== GS_LEVEL || this.player === null || this.world === null) return false;
    const ok = Saveg.writeSave(this, slot, description);
    if (ok) this.player.setMessage("game saved.");
    return ok;
  }

  loadGame(slot: number): boolean {
    this.demoPlayback = false;
    this.advancedemo = false;
    this.demoBuffer = null;
    if (!Saveg.readAndRestore(this, slot)) return false;
    this.palette = -1;
    this.keys = {};
    this.automap.resetLevel();
    this.status?.reset(this.player ?? null);
    this.player?.setMessage("game loaded.");
    process.stdout.write(`Loaded E${this.episode}M${this.mapn}\n`);
    return true;
  }

  returnToTitle(): void {
    this.player = null;
    this.world = null;
    this.wi = null;
    this.finale = null;
    this.automap.resetLevel();
    this.menu?.clear();
    this.startTitle();
  }

  startTitle(): void {
    this.demoPlayback = false;
    this.demoBuffer = null;
    this.demoP = 0;
    this.demoSequence = -1;
    this.advancedemo = true;
    this.doAdvanceDemo();
  }

  private pageTicker(): void {
    this.pageTic--;
    if (this.pageTic < 0) this.advancedemo = true;
  }

  private doAdvanceDemo(): void {
    this.advancedemo = false;
    this.demoPlayback = false;
    this.demoSequence = (this.demoSequence + 1) % 6;
    switch (this.demoSequence) {
      case 0:
        this.pageTic = this.commercial() ? TICRATE * 11 : 170;
        this.gamestate = GS_TITLE;
        this.pagePatch = this.titlePatch;
        this.sound.playTitleMusic();
        break;
      case 1:
        if (!this.playDemo("demo1")) {
          this.advancedemo = true;
          this.doAdvanceDemo();
        }
        break;
      case 2:
        this.pageTic = 200;
        this.gamestate = GS_TITLE;
        this.pagePatch = this.creditPatch ?? this.titlePatch;
        break;
      case 3:
        if (!this.playDemo("demo2")) {
          this.advancedemo = true;
          this.doAdvanceDemo();
        }
        break;
      case 4:
        this.pageTic = this.commercial() ? TICRATE * 11 : 200;
        this.gamestate = GS_TITLE;
        this.pagePatch = this.titlePatch;
        if (this.commercial()) this.sound.playTitleMusic();
        break;
      default:
        if (!this.playDemo("demo3")) {
          this.advancedemo = true;
          this.doAdvanceDemo();
        }
        break;
    }
  }

  playDemo(name: string): boolean {
    const data = this.loadDemoBytes(name);
    if (data === null || data.length < 13) return false;
    this.demoBuffer = data;
    this.demoP = 0;
    const demoVersion = data[this.demoP++]!;
    if (demoVersion <= 4) this.demoP = 0;
    const demoSkill = data[this.demoP++]!;
    const demoEpisode = data[this.demoP++]!;
    const demoMap = data[this.demoP++]!;
    this.demoP += 5;
    this.demoP += 4;
    if (demoSkill <= 4) this.skill = demoSkill;
    if (demoEpisode >= 1) this.episode = demoEpisode;
    if (demoMap >= 1) this.mapn = demoMap;
    this.loadLevel(false);
    this.demoPlayback = true;
    if (this.timingdemo) {
      this.timedemoStart = this.video.ticksMs();
      this.gametic = 0;
    }
    return true;
  }

  private loadDemoBytes(name: string): Buffer | null {
    for (const filePath of [name, `${name}.lmp`]) {
      if (Game.isFile(filePath)) return fs.readFileSync(filePath);
    }
    if (this.wad.checkNumForName(name) < 0) return null;
    return this.wad.cacheLumpName(name);
  }

  private beginRecording(): void {
    const buf = Buffer.alloc(13);
    buf[0] = 109;
    buf[1] = this.skill & 0xff;
    buf[2] = this.episode & 0xff;
    buf[3] = this.mapn & 0xff;
    buf[4] = 0;
    buf[5] = this.respawnparm ? 1 : 0;
    buf[6] = this.fastparm ? 1 : 0;
    buf[7] = this.nomonsters ? 1 : 0;
    buf[8] = 0;
    buf[9] = 1;
    buf[10] = 0;
    buf[11] = 0;
    buf[12] = 0;
    this.demoBuffer = buf;
    this.demoP = buf.length;
    this.demoRecording = true;
  }

  private writeDemoTiccmd(cmd: Ticcmd): void {
    if (!this.demoRecording || this.demoBuffer === null) return;
    const chunk = Buffer.from([
      cmd.forwardmove & 0xff,
      cmd.sidemove & 0xff,
      (cmd.angleturn >> 8) & 0xff,
      cmd.buttons & 0xff,
    ]);
    this.demoBuffer = Buffer.concat([this.demoBuffer.subarray(0, this.demoP), chunk]);
    this.demoP = this.demoBuffer.length;
  }

  finishRecording(): void {
    if (!this.demoRecording || this.demoBuffer === null) return;
    this.demoBuffer = Buffer.concat([
      this.demoBuffer.subarray(0, this.demoP),
      Buffer.from([Game.DEMOMARKER]),
    ]);
    let name = this.demoName || "demo.lmp";
    if (!name.toLowerCase().endsWith(".lmp")) name = `${name}.lmp`;
    try {
      fs.writeFileSync(name, this.demoBuffer);
      process.stdout.write(`Demo ${name} recorded\n`);
    } catch (exception) {
      process.stdout.write(`Demo write failed: ${(exception as Error).message}\n`);
    }
    this.demoRecording = false;
  }

  private checkDemoStatus(): void {
    if (this.timingdemo) {
      const now = this.video.ticksMs();
      const real = Math.max(1, intdiv((now - this.timedemoStart) * TICRATE, 1000));
      const fps = (this.gametic * TICRATE) / real;
      process.stdout.write(`timed ${this.gametic} gametics in ${real} realtics (${fps.toFixed(1)} fps)\n`);
      this.timingdemo = false;
      this.demoPlayback = false;
      this.running = false;
      return;
    }
    if (this.demoPlayback) {
      this.demoPlayback = false;
      if (this.singledemo) this.running = false;
      else this.advancedemo = true;
      return;
    }
    if (this.demoRecording) {
      this.finishRecording();
      this.running = false;
    }
  }

  private demoSByte(): number {
    const n = this.demoBuffer![this.demoP++]!;
    return n >= 128 ? n - 256 : n;
  }

  private readDemoTiccmd(): Ticcmd {
    const cmd = new Ticcmd();
    if (
      this.demoBuffer === null ||
      this.demoP + 4 > this.demoBuffer.length ||
      this.demoBuffer[this.demoP] === Game.DEMOMARKER
    ) {
      this.checkDemoStatus();
      return cmd;
    }
    cmd.forwardmove = this.demoSByte();
    cmd.sidemove = this.demoSByte();
    cmd.angleturn = this.demoBuffer![this.demoP++]! << 8;
    if (cmd.angleturn >= 32768) cmd.angleturn -= 65536;
    cmd.buttons = this.demoBuffer[this.demoP++]!;
    return cmd;
  }

  private beginPlay(): void {
    this.demoPlayback = false;
    this.advancedemo = false;
    this.demoBuffer = null;
    this.loadLevel(false);
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
    if (this.useMouse) {
      const sens = (this.mouseSensitivity + 5) / 10;
      const mx = Math.trunc(this.mouseX * sens);
      const my = Math.trunc(this.mouseY * sens);
      cmd.forwardmove += my;
      if (cmd.forwardmove > 127) cmd.forwardmove = 127;
      if (cmd.forwardmove < -127) cmd.forwardmove = -127;
      if (strafe) {
        cmd.sidemove += mx * 2;
        if (cmd.sidemove > 127) cmd.sidemove = 127;
        if (cmd.sidemove < -127) cmd.sidemove = -127;
      } else cmd.angleturn -= mx * 8;
      if (this.mouseFire) cmd.buttons |= BT_ATTACK;
      this.mouseX = 0;
      this.mouseY = 0;
    }
    return cmd;
  }

  runTic(): void {
    this.gametic += 1;
    this.syncMouseGrab();
    if (this.wiping) {
      if (this.wipe.tick(1, this.video.fb)) this.wiping = false;
      return;
    }
    this.menu?.ticker();
    this.sound.update();
    if (this.advancedemo) this.doAdvanceDemo();
    if (this.gamestate === GS_TITLE) {
      this.pageTicker();
      return;
    }
    if (this.gamestate === GS_INTERMISSION) {
      this.wi?.ticker();
      if (this.wi?.done) this.worldDone();
      return;
    }
    if (this.gamestate === GS_FINALE) {
      this.finale?.ticker();
      if (this.finale?.done) {
        if (this.finale.action === "worlddone") this.worldDone(true);
        else this.returnToTitle();
      }
      return;
    }
    if (this.gamestate !== GS_LEVEL || this.player === null) return;
    if (this.demoPlayback) this.player.cmd = this.readDemoTiccmd();
    else if (this.menu?.active) this.player.cmd = new Ticcmd();
    else {
      this.player.cmd = this.buildTiccmd();
      if (this.demoRecording) this.writeDemoTiccmd(this.player.cmd);
    }
    Player.playerThink(this.world!, this.player, this, this.leveltime);
    if (this.player.playerstate === PST_REBORN) {
      this.loadLevel(false);
      return;
    }
    Enemy.tickEnemies(this.world!, this);
    this.specials?.tick();
    if (this.specials?.exitRequested) {
      this.startSound("swtchx");
      this.completeLevel();
      return;
    }
    ++this.leveltime;
    this.automap.ticker(this);
    this.status?.ticker(this.player);
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
    if (this.gamestate === GS_TITLE && this.pagePatch !== null) {
      VVideo.fill(fb, 0);
      VVideo.drawPatch(fb, 0, 0, this.pagePatch);
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
      this.renderer!.setupFrame(mo.x, mo.y, this.player.viewz, mo.angle, this.player.extralight, this.player.fixedcolormap);
      this.renderer!.render(this.world!, fb);
      Sprites.drawSprites(this.renderer!, this.world!, fb);
      this.renderer!.drawMasked();
      if (this.player.playerstate !== PST_DEAD || this.player.pspriteSy < Sprites.WEAPONBOTTOM) {
        this.drawWeapon(fb);
      }
    }
    if (this.status !== null && (this.automap.active || this.renderer!.screenblocks < 11)) {
      this.status.draw(fb, this.player, this.showMessages);
    }
  }

  private applyPalette(): void {
    let palette = 0;
    const p = this.player;
    if (p !== null && this.gamestate === GS_LEVEL) {
      let cnt = p.damagecount;
      if (p.powers[PW_STRENGTH]) {
        const bzc = 12 - intdiv(p.powers[PW_STRENGTH]!, 64);
        if (bzc > cnt) cnt = bzc;
      }
      if (cnt) palette = Math.min(7, (cnt + 7) >> 3) + 1;
      else if (p.bonuscount) palette = Math.min(3, (p.bonuscount + 7) >> 3) + 9;
      else if (p.powers[PW_IRONFEET]! > 4 * 32 || (p.powers[PW_IRONFEET]! & 8) !== 0) palette = RADIATIONPAL;
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

  private syncMouseGrab(): void {
    const want =
      this.useMouse && this.gamestate === GS_LEVEL && !this.demoPlayback && !(this.menu?.active ?? false);
    this.video.setRelativeMouse(want);
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

  handleEvent(event: GameEvent): void {
    const type = event.type;
    const key = event.key ?? event.sym ?? 0;
    const unicodeChar = event.text ?? "";
    if (type === "quit") {
      if (this.demoRecording) this.finishRecording();
      this.running = false;
      return;
    }
    if (type === "mousemotion") {
      if (this.useMouse) {
        this.mouseX += event.dx ?? 0;
        this.mouseY += -(event.dy ?? 0);
      }
      return;
    }
    if (type === "mousedown") {
      if (event.button === 1) {
        this.mouseFire = true;
        if (this.finale !== null && this.gamestate === GS_FINALE) this.finale.responder();
      }
      return;
    }
    if (type === "mouseup") {
      if (event.button === 1) this.mouseFire = false;
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
      if (
        key === SPACE ||
        key === RETURN ||
        key === KP_ENTER ||
        key === "e".charCodeAt(0)
      ) {
        this.keys[key] = true;
      }
      if (this.finale !== null && this.gamestate === GS_FINALE && this.finale.responder()) return;
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
      if (key === F11) this.video.showFps = !this.video.showFps;
      else if (this.demoPlayback || this.gamestate === GS_TITLE) this.beginPlay();
      else this.feedCheat(unicodeChar);
    } else if (type === "keyup") {
      delete this.keys[key];
      this.automap.responder(type, key, this);
    }
  }

  private feedCheat(input: string): void {
    if (this.gamestate !== GS_LEVEL || this.player === null) return;
    const char = input.toLowerCase();
    if (char.length !== 1 || !/[a-z0-9]/.test(char)) return;
    const nightmare = this.skill === SK_NIGHTMARE;
    for (const cheat of deh.cheats) {
      const param = cheat.feed(char);
      if (param === null) continue;
      if (nightmare && cheat.action !== "clev" && cheat.action !== "iddt") continue;
      this.doCheat(cheat.action, param);
    }
  }

  private doCheat(action: string, param: string): void {
    switch (action) {
      case "god":
        this.cheatGod();
        break;
      case "kfa":
        this.cheatAmmo(true);
        break;
      case "fa":
        this.cheatAmmo(false);
        break;
      case "noclip":
      case "noclip2":
        this.cheatNoclip();
        break;
      case "iddt":
        if (this.automap.active) this.automap.cycleIddt();
        break;
      case "behold":
        this.player!.setMessage("invin visis rad allmap lite amp");
        break;
      case "beholdv":
      case "beholds":
      case "beholdi":
      case "beholdr":
      case "beholda":
      case "beholdl":
        this.cheatBehold("vsiral".indexOf(action[6]!));
        break;
      case "choppers":
        this.player!.weaponowned[WP_CHAINSAW] = true;
        this.player!.pendingweapon = WP_CHAINSAW;
        this.player!.powers[PW_INVULNERABILITY] = 1;
        this.player!.setMessage("... doesn't suck - GM");
        break;
      case "mypos": {
        const mo = this.player!.mo!;
        this.player!.setMessage(`ang=0x${(mo.angle >>> 0).toString(16)};x,y=(0x${mo.x.toString(16)},0x${mo.y.toString(16)})`);
        break;
      }
      case "clev":
        this.cheatClev(param);
        break;
      case "mus":
        this.cheatMus(param);
        break;
    }
  }

  private cheatGod(): void {
    const p = this.player!;
    p.cheats ^= CF_GODMODE;
    if ((p.cheats & CF_GODMODE) !== 0) {
      p.health = deh.godModeHealth;
      p.mo!.health = deh.godModeHealth;
      p.setMessage("Degreelessness Mode On");
    } else p.setMessage("Degreelessness Mode Off");
  }

  private cheatAmmo(keys: boolean): void {
    const p = this.player!;
    p.armorpoints = keys ? deh.idkfaArmor : deh.idfaArmor;
    p.armortype = keys ? deh.idkfaArmorClass : deh.idfaArmorClass;
    p.weaponowned = new Array(p.weaponowned.length).fill(true);
    p.maxammo = [...deh.maxammo];
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

  private cheatBehold(pw: number): void {
    if (pw < 0) return;
    const p = this.player!;
    if (!p.powers[pw]) {
      Player.givePower(p, pw);
      if (pw === PW_STRENGTH && p.readyweapon !== WP_FIST) p.pendingweapon = WP_FIST;
    } else if (pw === PW_STRENGTH) p.powers[pw] = 0;
    else p.powers[pw] = 1;
    p.setMessage("Power-up Toggled");
  }

  private cheatClev(param: string): void {
    if (param.length < 2 || !/^\d+$/.test(param)) return;
    const a = parseInt(param[0]!, 10);
    const b = parseInt(param[1]!, 10);
    let episode: number;
    let mapn: number;
    let lump: string;
    if (this.commercial()) {
      episode = 1;
      mapn = a * 10 + b;
      lump = `MAP${String(mapn).padStart(2, "0")}`;
    } else {
      episode = a;
      mapn = b;
      lump = `E${episode}M${mapn}`;
    }
    if (episode < 1 || mapn < 1 || this.wad.checkNumForName(lump) < 0) return;
    this.player!.setMessage("Changing Level...");
    this.startNewGame(this.skill, episode, mapn);
  }

  private cheatMus(param: string): void {
    if (param.length < 2 || !/^\d+$/.test(param)) return;
    const a = parseInt(param[0]!, 10);
    const b = parseInt(param[1]!, 10);
    let name: string;
    if (this.commercial()) {
      const mapn = a * 10 + b;
      const tracks = Sound.doom2Music();
      if (mapn < 1 || mapn > tracks.length) {
        this.player!.setMessage("IMPOSSIBLE SELECTION");
        return;
      }
      name = tracks[mapn - 1]!;
    } else {
      if (a < 1 || b < 1 || b > 9) {
        this.player!.setMessage("IMPOSSIBLE SELECTION");
        return;
      }
      name = `e${a}m${b}`;
    }
    if (!this.sound.hasMusic(name)) {
      this.player!.setMessage("IMPOSSIBLE SELECTION");
      return;
    }
    this.sound.changeMusic(name, true);
    this.player!.setMessage("Music Change");
  }

  static main(argv: string[]): number {
    try {
      const game = new Game();
      loadConfig(game);
      const iwad = Game.parseArgs(argv, game);
      const iwadPath = Game.findIwad(iwad);
      game.iwadPath = iwadPath;
      process.stdout.write(`IWAD: ${iwadPath}\n`);
      game.wad.addFile(iwadPath);
      for (const extra of game.pwadFiles) {
        process.stdout.write(`PWAD: ${extra}\n`);
        game.wad.addFile(extra);
      }
      deh.loadAfterIwad(game.wad, iwadPath);
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
      if (game.nosound) {
        game.sound.enabled = false;
        game.sound.musicEnabled = false;
      }
      if (game.nomusic) game.sound.musicEnabled = false;
      game.sound.init(game.wad);
      game.sound.output = game.video;
      game.menu = new Menu(game.wad, game.sound, game);
      if (game.wad.checkNumForName("TITLEPIC") >= 0) game.titlePatch = game.wad.cacheLumpName("TITLEPIC");
      if (game.wad.checkNumForName("CREDIT") >= 0) game.creditPatch = game.wad.cacheLumpName("CREDIT");
      game.pagePatch = game.titlePatch;
      game.status = new Status(game.wad);
      if (game.recordName) {
        game.demoName = game.recordName;
        game.demoRecording = true;
        game.startNewGame(game.skill, game.episode, game.mapn);
      } else if (game.timedemoName) {
        game.timingdemo = true;
        game.singledemo = true;
        if (!game.playDemo(game.timedemoName)) {
          process.stdout.write(`timedemo not found: ${game.timedemoName}\n`);
          game.video.shutdown();
          return 1;
        }
      } else if (game.playdemoName) {
        game.singledemo = true;
        if (!game.playDemo(game.playdemoName)) {
          process.stdout.write(`playdemo not found: ${game.playdemoName}\n`);
          game.video.shutdown();
          return 1;
        }
      } else if (argv.includes("-warp")) game.loadLevel();
      else game.startTitle();
      const tickMs = 1000 / TICRATE;
      let accum = 0;
      let last = game.video.ticksMs();
      while (game.running) {
        for (const event of game.video.pollEvents()) game.handleEvent(event);
        const now = game.video.ticksMs();
        accum += now - last;
        last = now;
        if (game.timingdemo) game.runTic();
        else {
          while (accum >= tickMs) {
            game.runTic();
            accum -= tickMs;
          }
        }
        game.draw();
        if (!game.timingdemo && accum < tickMs / 2) Game.usleep(1);
      }
      if (game.demoRecording) game.finishRecording();
      saveConfig(game);
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
      else if (arg === "-fast") game.fastparm = true;
      else if (arg === "-respawn") game.respawnparm = true;
      else if (arg === "-warp" && argv[i + 2] !== undefined) {
        game.episode = parseInt(argv[++i]!, 10) || 0;
        game.mapn = parseInt(argv[++i]!, 10) || 0;
      } else if (arg === "-skill" && argv[i + 1] !== undefined) game.skill = parseInt(argv[++i]!, 10) || 0;
      else if (arg === "-fullscreen") game.fullscreen = true;
      else if (arg === "-crt") game.crt = true;
      else if (arg === "-deh") {
        while (argv[i + 1] !== undefined && !argv[i + 1]!.startsWith("-")) deh.files.push(argv[++i]!);
      } else if (arg === "-nodeh") deh.nodeh = true;
      else if (arg === "-dehlump") deh.dehlump = true;
      else if (arg === "-nocheats") deh.applyCheats = false;
      else if (arg === "-file") {
        while (argv[i + 1] !== undefined && !argv[i + 1]!.startsWith("-")) game.pwadFiles.push(argv[++i]!);
      } else if (arg === "-record" && argv[i + 1] !== undefined) game.recordName = argv[++i]!;
      else if (arg === "-playdemo" && argv[i + 1] !== undefined) game.playdemoName = argv[++i]!;
      else if (arg === "-timedemo" && argv[i + 1] !== undefined) game.timedemoName = argv[++i]!;
      else if (arg === "-nosound") game.nosound = true;
      else if (arg === "-nomusic") game.nomusic = true;
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

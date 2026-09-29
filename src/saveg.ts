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
import * as path from "node:path";
import { GS_LEVEL, LOADSAVEEMPTY, SAVEGAMENAME, SAVESTRINGSIZE } from "./defs.ts";
import type { Game } from "./game.ts";
import { Mobj } from "./mobj.ts";
import { Player } from "./player.ts";
import { Button, FloorMove, Plat, Specials, VerticalDoor } from "./specials.ts";
import { World } from "./world.ts";

export class Saveg {
  private static readonly MAGIC = "DOOMPY01";
  private static readonly PLAYER_FIELDS = [
    "playerstate", "viewz", "viewheight", "deltaviewheight", "bob", "health",
    "armorpoints", "armortype", "ammo", "maxammo", "weaponowned", "pendingweapon",
    "readyweapon", "cards", "cheats", "message", "messageTics", "attackdown",
    "usedown", "damagecount", "bonuscount", "extralight", "refire", "killcount",
    "itemcount", "secretcount", "didsecret", "pspriteY", "pspriteSy",
    "pspriteState", "pspriteTics", "pspriteStep", "pspriteBody", "pspriteFlash",
    "flashTics",
  ];
  private static readonly MOBJ_FIELDS = [
    "x", "y", "z", "angle", "momx", "momy", "momz", "radius", "height",
    "floorz", "ceilingz", "flags", "health", "type", "sprite", "info", "alive",
    "reactiontime", "movedir", "movecount", "aiState", "frame", "tics",
    "chaseTics", "justAttacked", "damage", "attackKind", "didFire",
  ];

  static savePath(game: Game, slot: number): string {
    let directory: string;
    if (game.iwadPath !== "") {
      try {
        directory = path.dirname(fs.realpathSync(game.iwadPath));
      } catch {
        directory = path.dirname(game.iwadPath);
      }
    } else {
      directory = process.cwd();
    }
    return directory + path.sep + SAVEGAMENAME + slot + ".dsg";
  }

  static readSlotDescription(game: Game, slot: number): [string, boolean] {
    let data: Buffer;
    try {
      data = fs.readFileSync(Saveg.savePath(game, slot));
    } catch {
      return [LOADSAVEEMPTY, false];
    }
    if (
      data.length < SAVESTRINGSIZE + 8 ||
      data.toString("latin1", SAVESTRINGSIZE, SAVESTRINGSIZE + 8) !== Saveg.MAGIC
    ) {
      return [LOADSAVEEMPTY, false];
    }
    const raw = data.toString("latin1", 0, SAVESTRINGSIZE);
    const nul = raw.indexOf("\0");
    const description = (nul < 0 ? raw : raw.slice(0, nul)).replace(/\s+$/, "");
    return [description !== "" ? description : LOADSAVEEMPTY, true];
  }

  static writeSave(game: Game, slot: number, description: string): boolean {
    if (game.world === null || game.player === null) return false;
    const json = JSON.stringify(Saveg.dumpState(game));
    description = description.slice(0, SAVESTRINGSIZE);
    const name = Buffer.alloc(SAVESTRINGSIZE);
    name.write(description, 0, "latin1");
    const blob = Buffer.concat([name, Buffer.from(Saveg.MAGIC, "latin1"), Buffer.from(json, "utf8")]);
    const p = Saveg.savePath(game, slot);
    const temporary = p + ".tmp";
    try {
      fs.writeFileSync(temporary, blob);
    } catch {
      return false;
    }
    try {
      if (process.platform === "win32" && fs.existsSync(p)) fs.unlinkSync(p);
      fs.renameSync(temporary, p);
      return true;
    } catch {
      return false;
    }
  }

  static readAndRestore(game: Game, slot: number): boolean {
    try {
      const data = fs.readFileSync(Saveg.savePath(game, slot));
      const offset = SAVESTRINGSIZE + 8;
      if (
        data.length < offset ||
        data.toString("latin1", SAVESTRINGSIZE, SAVESTRINGSIZE + 8) !== Saveg.MAGIC
      ) {
        return false;
      }
      const state = JSON.parse(data.toString("utf8", offset));
      Saveg.restoreState(game, state);
      return true;
    } catch {
      return false;
    }
  }

  private static dumpState(game: Game): Record<string, unknown> {
    const world = game.world!;
    const mobjs = world.mobjs;
    const dump = (object: unknown, fields: string[]): Record<string, unknown> => {
      const result: Record<string, unknown> = {};
      for (const field of fields) {
        if (field in (object as object)) result[field] = (object as Record<string, unknown>)[field];
      }
      return result;
    };
    const mobjRecords: Array<Record<string, unknown>> = [];
    for (const mobj of mobjs) {
      const record = dump(mobj, Saveg.MOBJ_FIELDS);
      if (Array.isArray(record["info"])) record["info"] = [...(record["info"] as unknown[])];
      record["target"] = mobj.target === null ? null : mobjs.indexOf(mobj.target);
      record["isPlayer"] = mobj.player !== null;
      mobjRecords.push(record);
    }
    const thinkers: Array<Record<string, unknown>> = [];
    if (game.specials !== null) {
      for (const thinker of game.specials.thinkers) {
        if (thinker.dead) continue;
        const sector = world.sectors.indexOf(thinker.sector);
        if (sector === -1) continue;
        if (thinker instanceof VerticalDoor) {
          thinkers.push(
            Saveg.record(thinker, "door", sector, [
              "type", "direction", "topheight", "speed", "topwait", "topcountdown",
            ]),
          );
        } else if (thinker instanceof Plat) {
          thinkers.push(
            Saveg.record(thinker, "plat", sector, ["type", "status", "speed", "low", "high", "wait", "count"]),
          );
        } else if (thinker instanceof FloorMove) {
          thinkers.push(Saveg.record(thinker, "floor", sector, ["direction", "dest", "speed"]));
        }
      }
    }
    const buttons: Array<Record<string, unknown>> = [];
    for (const button of game.specials?.buttons ?? []) {
      buttons.push({
        line: button.line.iLine ?? -1,
        where: button.where,
        texture: button.texture,
        timer: button.timer,
      });
    }
    return {
      episode: game.episode,
      mapn: game.mapn,
      skill: game.skill,
      leveltime: game.leveltime,
      player: dump(game.player, Saveg.PLAYER_FIELDS),
      sectors: world.sectors.map((s) =>
        dump(s, ["floorheight", "ceilingheight", "floorpic", "ceilingpic", "lightlevel", "special"]),
      ),
      sides: world.sides.map((s) =>
        dump(s, ["textureoffset", "rowoffset", "toptexture", "bottomtexture", "midtexture"]),
      ),
      lines: world.lines.map((l) => ({ flags: l.flags, special: l.special })),
      mobjs: mobjRecords,
      thinkers,
      buttons,
      totalkills: game.totalkills,
      totalitems: game.totalitems,
      totalsecret: game.totalsecret,
    };
  }

  private static record(object: unknown, kind: string, sector: number, fields: string[]): Record<string, unknown> {
    const record: Record<string, unknown> = { kind, sector };
    for (const field of fields) record[field] = (object as Record<string, unknown>)[field];
    return record;
  }

  private static restoreState(game: Game, state: Record<string, any>): void {
    game.episode = state["episode"] | 0;
    game.mapn = state["mapn"] | 0;
    game.skill = state["skill"] | 0;
    game.leveltime = (state["leveltime"] ?? 0) | 0;
    game.totalkills = (state["totalkills"] ?? 0) | 0;
    game.totalitems = (state["totalitems"] ?? 0) | 0;
    game.totalsecret = (state["totalsecret"] ?? 0) | 0;
    game.world = new World();
    game.world.setupLevel(game.wad, game.res!, game.episode, game.mapn);
    game.specials = new Specials(game.world, game.res!, game.sound);
    const world = game.world;
    Saveg.restoreList(world.sectors, state["sectors"] ?? []);
    Saveg.restoreList(world.sides, state["sides"] ?? []);
    Saveg.restoreList(world.lines, state["lines"] ?? []);
    for (const sector of world.sectors) sector.specialdata = null;

    const thinkers: Array<VerticalDoor | Plat | FloorMove> = [];
    for (const record of state["thinkers"] ?? []) {
      const sector = world.sectors[record["sector"] | 0];
      if (!sector) continue;
      let thinker: VerticalDoor | Plat | FloorMove | null = null;
      switch (record["kind"] ?? "") {
        case "door":
          thinker = new VerticalDoor(
            sector,
            record["type"] | 0,
            record["direction"] | 0,
            record["topheight"] | 0,
            record["speed"] | 0,
            record["topwait"] | 0,
            record["topcountdown"] | 0,
          );
          break;
        case "plat":
          thinker = new Plat(
            sector,
            record["type"] | 0,
            record["status"] | 0,
            record["speed"] | 0,
            record["low"] | 0,
            record["high"] | 0,
            record["wait"] | 0,
            record["count"] | 0,
          );
          break;
        case "floor":
          thinker = new FloorMove(sector, record["direction"] | 0, record["dest"] | 0, record["speed"] | 0);
          break;
      }
      if (thinker !== null) {
        sector.specialdata = thinker;
        thinkers.push(thinker);
      }
    }
    game.specials.thinkers = thinkers;
    game.specials.buttons = [];
    for (const record of state["buttons"] ?? []) {
      const line = world.lines[record["line"] | 0];
      if (line) {
        game.specials.buttons.push(
          new Button(line, record["where"], record["texture"] | 0, record["timer"] | 0),
        );
      }
    }

    const mobjs: Mobj[] = [];
    for (const record of state["mobjs"] ?? []) {
      const mobj = new Mobj();
      for (const field of Saveg.MOBJ_FIELDS) {
        if (field in record) (mobj as unknown as Record<string, unknown>)[field] = record[field];
      }
      if (Array.isArray(record["info"])) mobj.info = record["info"];
      mobjs.push(mobj);
    }
    const rawMobjs = state["mobjs"] ?? [];
    for (let i = 0; i < mobjs.length; ++i) {
      const target = rawMobjs[i]?.["target"] ?? null;
      if (typeof target === "number" && mobjs[target]) mobjs[i]!.target = mobjs[target]!;
    }
    game.player = null;
    for (let i = 0; i < mobjs.length; ++i) {
      if (rawMobjs[i]?.["isPlayer"]) {
        const mobj = mobjs[i]!;
        const player = new Player(mobj);
        for (const field of Saveg.PLAYER_FIELDS) {
          if (field in (state["player"] ?? {})) {
            (player as unknown as Record<string, unknown>)[field] = state["player"][field];
          }
        }
        mobj.player = player;
        mobj.health = player.health;
        game.player = player;
        break;
      }
    }
    if (game.player === null) throw new Error("save has no player");
    world.mobjs = mobjs;
    game.gamestate = GS_LEVEL;
    game.sound.playLevelMusic(game.episode, game.mapn);
  }

  private static restoreList(objects: unknown[], records: Array<Record<string, unknown>>): void {
    for (let i = 0; i < records.length; ++i) {
      if (!objects[i]) break;
      const record = records[i]!;
      for (const field of Object.keys(record)) {
        (objects[i] as Record<string, unknown>)[field] = record[field];
      }
    }
  }
}

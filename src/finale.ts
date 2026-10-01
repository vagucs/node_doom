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

import path from "node:path";
import { u32 } from "./bin.ts";
import { intdiv } from "./compat.ts";
import { HU_FONTEND, HU_FONTSIZE, HU_FONTSTART, SCREENHEIGHT, SCREENWIDTH } from "./defs.ts";
import type { Game } from "./game.ts";
import {
  FF_FRAMEMASK,
  MI_DEATHSTATE,
  MI_MELEESTATE,
  MI_MISSILESTATE,
  MI_SEESTATE,
  MOBJINFO,
  MT_BABY,
  MT_BRUISER,
  MT_CHAINGUY,
  MT_CYBORG,
  MT_FATSO,
  MT_HEAD,
  MT_KNIGHT,
  MT_PAIN,
  MT_PLAYER,
  MT_POSSESSED,
  MT_SERGEANT,
  MT_SHOTGUY,
  MT_SKULL,
  MT_SPIDER,
  MT_TROOP,
  MT_UNDEAD,
  MT_VILE,
  S_BOS2_ATK2,
  S_BOSS_ATK2,
  S_BSPI_ATK2,
  S_CPOS_ATK2,
  S_CPOS_ATK3,
  S_CPOS_ATK4,
  S_CYBER_ATK2,
  S_CYBER_ATK4,
  S_CYBER_ATK6,
  S_FATT_ATK2,
  S_FATT_ATK5,
  S_FATT_ATK8,
  S_HEAD_ATK2,
  S_NULL,
  S_PAIN_ATK3,
  S_PLAY_ATK1,
  S_POSS_ATK2,
  S_SARG_ATK2,
  S_SKEL_FIST2,
  S_SKEL_FIST4,
  S_SKEL_MISS2,
  S_SKULL_ATK2,
  S_SPID_ATK2,
  S_SPID_ATK3,
  S_SPOS_ATK2,
  S_TROO_ATK3,
  S_VILE_ATK2,
  SPRNAMES,
  STATES,
} from "./info.ts";
import { KP_ENTER, LCTRL, RCTRL, RETURN, SPACE } from "./keys.ts";
import { Sprites } from "./sprites.ts";
import { drawPatch, fill, patchSize } from "./vvideo.ts";

const TEXTSPEED = 3;
const TEXTWAIT = 250;
const STAGE_TEXT = 0;
const STAGE_ART = 1;
const STAGE_CAST = 2;

const E1TEXT =
  "Once you beat the big badasses and\n" +
  "clean out the moon base you're supposed\n" +
  "to win, aren't you? Aren't you? Where's\n" +
  "your fat reward and ticket home? What\n" +
  "the hell is this? It's not supposed to\n" +
  "end this way!\n" +
  "\n" +
  "It stinks like rotten meat, but looks\n" +
  "like the lost Deimos base.  Looks like\n" +
  "you're stuck on The Shores of Hell.\n" +
  "The only way out is through.\n" +
  "\n" +
  "To continue the DOOM experience, play\n" +
  "The Shores of Hell and its amazing\n" +
  "sequel, Inferno!\n";

const E2TEXT =
  "You've done it! The hideous cyber-\n" +
  "demon lord that ruled the lost Deimos\n" +
  "moon base has been slain and you\n" +
  "are triumphant! But ... where are\n" +
  "you? You clamber to the edge of the\n" +
  "moon and look down to see the awful\n" +
  "truth.\n" +
  "\n" +
  "Deimos floats above Hell itself!\n" +
  "You've never heard of anyone escaping\n" +
  "from Hell, but you'll make the bastards\n" +
  "sorry they ever heard of you! Quickly,\n" +
  "you rappel down to  the surface of\n" +
  "Hell.\n" +
  "\n" +
  "Now, it's on to the final chapter of\n" +
  "DOOM! -- Inferno.\n";

const E3TEXT =
  "The loathsome spiderdemon that\n" +
  "masterminded the invasion of the moon\n" +
  "bases and caused so much death has had\n" +
  "its ass kicked for all time.\n" +
  "\n" +
  "A hidden doorway opens and you enter.\n" +
  "You've proven too tough for Hell to\n" +
  "contain, and now Hell at last plays\n" +
  "fair -- for you emerge from the door\n" +
  "to see the green fields of Earth!\n" +
  "Home at last.\n" +
  "\n" +
  "You wonder what's been happening on\n" +
  "Earth while you were battling evil\n" +
  "unleashed. It's good that no Hell-\n" +
  "spawn could have come through that\n" +
  "door with you ...\n";

const E4TEXT =
  "the spider mastermind must have sent forth\n" +
  "its legions of hellspawn before your\n" +
  "final confrontation with that terrible\n" +
  "beast from hell.  but you stepped forward\n" +
  "and brought forth eternal damnation and\n" +
  "suffering upon the horde as a true hero\n" +
  "would in the face of something so evil.\n" +
  "\n" +
  "besides, someone was gonna pay for what\n" +
  "happened to daisy, your pet rabbit.\n" +
  "\n" +
  "but now, you see spread before you more\n" +
  "potential pain and gibbitude as a nation\n" +
  "of demons run amok among our cities.\n" +
  "\n" +
  "next stop, hell on earth!";

const C1TEXT =
  "YOU HAVE ENTERED DEEPLY INTO THE INFESTED\n" +
  "STARPORT. BUT SOMETHING IS WRONG. THE\n" +
  "MONSTERS HAVE BROUGHT THEIR OWN REALITY\n" +
  "WITH THEM, AND THE STARPORT'S TECHNOLOGY\n" +
  "IS BEING SUBVERTED BY THEIR PRESENCE.\n" +
  "\n" +
  "AHEAD, YOU SEE AN OUTPOST OF HELL, A\n" +
  "FORTIFIED ZONE. IF YOU CAN GET PAST IT,\n" +
  "YOU CAN PENETRATE INTO THE HAUNTED HEART\n" +
  "OF THE STARBASE AND FIND THE CONTROLLING\n" +
  "SWITCH WHICH HOLDS EARTH'S POPULATION\n" +
  "HOSTAGE.";

const C2TEXT =
  "YOU HAVE WON! YOUR VICTORY HAS ENABLED\n" +
  "HUMANKIND TO EVACUATE EARTH AND ESCAPE\n" +
  "THE NIGHTMARE.  NOW YOU ARE THE ONLY\n" +
  "HUMAN LEFT ON THE FACE OF THE PLANET.\n" +
  "CANNIBAL MUTATIONS, CARNIVOROUS ALIENS,\n" +
  "AND EVIL SPIRITS ARE YOUR ONLY NEIGHBORS.\n" +
  "YOU SIT BACK AND WAIT FOR DEATH, CONTENT\n" +
  "THAT YOU HAVE SAVED YOUR SPECIES.\n" +
  "\n" +
  "BUT THEN, EARTH CONTROL BEAMS DOWN A\n" +
  "MESSAGE FROM SPACE: \"SENSORS HAVE LOCATED\n" +
  "THE SOURCE OF THE ALIEN INVASION. IF YOU\n" +
  "GO THERE, YOU MAY BE ABLE TO BLOCK THEIR\n" +
  "ENTRY.  THE ALIEN BASE IS IN THE HEART OF\n" +
  "YOUR OWN HOME CITY, NOT FAR FROM THE\n" +
  "STARPORT.\" SLOWLY AND PAINFULLY YOU GET\n" +
  "UP AND RETURN TO THE FRAY.";

const C3TEXT =
  "YOU ARE AT THE CORRUPT HEART OF THE CITY,\n" +
  "SURROUNDED BY THE CORPSES OF YOUR ENEMIES.\n" +
  "YOU SEE NO WAY TO DESTROY THE CREATURES'\n" +
  "ENTRYWAY ON THIS SIDE, SO YOU CLENCH YOUR\n" +
  "TEETH AND PLUNGE THROUGH IT.\n" +
  "\n" +
  "THERE MUST BE A WAY TO CLOSE IT ON THE\n" +
  "OTHER SIDE. WHAT DO YOU CARE IF YOU'VE\n" +
  "GOT TO GO THROUGH HELL TO GET TO IT?";

const C4TEXT =
  "THE HORRENDOUS VISAGE OF THE BIGGEST\n" +
  "DEMON YOU'VE EVER SEEN CRUMBLES BEFORE\n" +
  "YOU, AFTER YOU PUMP YOUR ROCKETS INTO\n" +
  "HIS EXPOSED BRAIN. THE MONSTER SHRIVELS\n" +
  "UP AND DIES, ITS THRASHING LIMBS\n" +
  "DEVASTATING UNTOLD MILES OF HELL'S\n" +
  "SURFACE.\n" +
  "\n" +
  "YOU'VE DONE IT. THE INVASION IS OVER.\n" +
  "EARTH IS SAVED. HELL IS A WRECK. YOU\n" +
  "WONDER WHERE BAD FOLKS WILL GO WHEN THEY\n" +
  "DIE, NOW. WIPING THE SWEAT FROM YOUR\n" +
  "FOREHEAD YOU BEGIN THE LONG TREK BACK\n" +
  "HOME. REBUILDING EARTH OUGHT TO BE A\n" +
  "LOT MORE FUN THAN RUINING IT WAS.\n";

const C5TEXT =
  "CONGRATULATIONS, YOU'VE FOUND THE SECRET\n" +
  "LEVEL! LOOKS LIKE IT'S BEEN BUILT BY\n" +
  "HUMANS, RATHER THAN DEMONS. YOU WONDER\n" +
  "WHO THE INMATES OF THIS CORNER OF HELL\n" +
  "WILL BE.";

const C6TEXT =
  "CONGRATULATIONS, YOU'VE FOUND THE\n" +
  "SUPER SECRET LEVEL!  YOU'D BETTER\n" +
  "BLAZE THROUGH THIS ONE!\n";

const P1TEXT =
  "You gloat over the steaming carcass of the\n" +
  "Guardian.  With its death, you've wrested\n" +
  "the Accelerator from the stinking claws\n" +
  "of Hell.  You relax and glance around the\n" +
  "room.  Damn!  There was supposed to be at\n" +
  "least one working prototype, but you can't\n" +
  "see it. The demons must have taken it.\n" +
  "\n" +
  "You must find the prototype, or all your\n" +
  "struggles will have been wasted. Keep\n" +
  "moving, keep fighting, keep killing.\n" +
  "Oh yes, keep living, too.";

const P2TEXT =
  "Even the deadly Arch-Vile labyrinth could\n" +
  "not stop you, and you've gotten to the\n" +
  "prototype Accelerator which is soon\n" +
  "efficiently and permanently deactivated.\n" +
  "\n" +
  "You're good at that kind of thing.";

const P3TEXT =
  "You've bashed and battered your way into\n" +
  "the heart of the devil-hive.  Time for a\n" +
  "Search-and-Destroy mission, aimed at the\n" +
  "Gatekeeper, whose foul offspring is\n" +
  "cascading to Earth.  Yeah, he's bad. But\n" +
  "you know who's worse!\n" +
  "\n" +
  "Grinning evilly, you check your gear, and\n" +
  "get ready to give the bastard a little Hell\n" +
  "of your own making!";

const P4TEXT =
  "The Gatekeeper's evil face is splattered\n" +
  "all over the place.  As its tattered corpse\n" +
  "collapses, an inverted Gate forms and\n" +
  "sucks down the shards of the last\n" +
  "prototype Accelerator, not to mention the\n" +
  "few remaining demons.  You're done. Hell\n" +
  "has gone back to pounding bad dead folks \n" +
  "instead of good live ones.  Remember to\n" +
  "tell your grandkids to put a rocket\n" +
  "launcher in your coffin. If you go to Hell\n" +
  "when you die, you'll need it for some\n" +
  "final cleaning-up ...";

const P5TEXT =
  "You've found the second-hardest level we\n" +
  "got. Hope you have a saved game a level or\n" +
  "two previous.  If not, be prepared to die\n" +
  "aplenty. For master marines only.";

const P6TEXT =
  "Betcha wondered just what WAS the hardest\n" +
  "level we had ready for ya?  Now you know.\n" +
  "No one gets out alive.";

const T1TEXT =
  "You've fought your way out of the infested\n" +
  "experimental labs.   It seems that UAC has\n" +
  "once again gulped it down.  With their\n" +
  "high turnover, it must be hard for poor\n" +
  "old UAC to buy corporate health insurance\n" +
  "nowadays..\n" +
  "\n" +
  "Ahead lies the military complex, now\n" +
  "swarming with diseased horrors hot to get\n" +
  "their teeth into you. With luck, the\n" +
  "complex still has some warlike ordnance\n" +
  "laying around.";

const T2TEXT =
  "You hear the grinding of heavy machinery\n" +
  "ahead.  You sure hope they're not stamping\n" +
  "out new hellspawn, but you're ready to\n" +
  "ream out a whole herd if you have to.\n" +
  "They might be planning a blood feast, but\n" +
  "you feel about as mean as two thousand\n" +
  "maniacs packed into one mad killer.\n" +
  "\n" +
  "You don't plan to go down easy.";

const T3TEXT =
  "The vista opening ahead looks real damn\n" +
  "familiar. Smells familiar, too -- like\n" +
  "fried excrement. You didn't like this\n" +
  "place before, and you sure as hell ain't\n" +
  "planning to like it now. The more you\n" +
  "brood on it, the madder you get.\n" +
  "Hefting your gun, an evil grin trickles\n" +
  "onto your face. Time to take some names.";

const T4TEXT =
  "Suddenly, all is silent, from one horizon\n" +
  "to the other. The agonizing echo of Hell\n" +
  "fades away, the nightmare sky turns to\n" +
  "blue, the heaps of monster corpses start \n" +
  "to evaporate along with the evil stench \n" +
  "that filled the air. Jeeze, maybe you've\n" +
  "done it. Have you really won?\n" +
  "\n" +
  "Something rumbles in the distance.\n" +
  "A blue light begins to glow inside the\n" +
  "ruined skull of the demon-spitter.";

const T5TEXT =
  "What now? Looks totally different. Kind\n" +
  "of like King Tut's condo. Well,\n" +
  "whatever's here can't be any worse\n" +
  "than usual. Can it?  Or maybe it's best\n" +
  "to let sleeping gods lie..";

const T6TEXT =
  "Time for a vacation. You've burst the\n" +
  "bowels of hell and by golly you're ready\n" +
  "for a break. You mutter to yourself,\n" +
  "Maybe someone else can kick Hell's ass\n" +
  "next time around. Ahead lies a quiet town,\n" +
  "with peaceful flowing water, quaint\n" +
  "buildings, and presumably no Hellspawn.\n" +
  "\n" +
  "As you step off the transport, you hear\n" +
  "the stomp of a cyberdemon's iron shoe.";

const CASTORDER: [string, number][] = [
  ["ZOMBIEMAN", MT_POSSESSED],
  ["SHOTGUN GUY", MT_SHOTGUY],
  ["HEAVY WEAPON DUDE", MT_CHAINGUY],
  ["IMP", MT_TROOP],
  ["DEMON", MT_SERGEANT],
  ["LOST SOUL", MT_SKULL],
  ["CACODEMON", MT_HEAD],
  ["HELL KNIGHT", MT_KNIGHT],
  ["BARON OF HELL", MT_BRUISER],
  ["ARACHNOTRON", MT_BABY],
  ["PAIN ELEMENTAL", MT_PAIN],
  ["REVENANT", MT_UNDEAD],
  ["MANCUBUS", MT_FATSO],
  ["ARCH-VILE", MT_VILE],
  ["THE SPIDER MASTERMIND", MT_SPIDER],
  ["THE CYBERDEMON", MT_CYBORG],
  ["OUR HERO", MT_PLAYER],
];

const CAST_SFX: Record<number, string> = {
  [S_PLAY_ATK1]: "dshtgn",
  [S_POSS_ATK2]: "pistol",
  [S_SPOS_ATK2]: "shotgn",
  [S_VILE_ATK2]: "vilatk",
  [S_SKEL_FIST2]: "skeswg",
  [S_SKEL_FIST4]: "skepch",
  [S_SKEL_MISS2]: "skeatk",
  [S_FATT_ATK8]: "firsht",
  [S_FATT_ATK5]: "firsht",
  [S_FATT_ATK2]: "firsht",
  [S_CPOS_ATK2]: "shotgn",
  [S_CPOS_ATK3]: "shotgn",
  [S_CPOS_ATK4]: "shotgn",
  [S_TROO_ATK3]: "claw",
  [S_SARG_ATK2]: "sgtatk",
  [S_BOSS_ATK2]: "firsht",
  [S_BOS2_ATK2]: "firsht",
  [S_HEAD_ATK2]: "firsht",
  [S_SKULL_ATK2]: "sklatk",
  [S_SPID_ATK2]: "shotgn",
  [S_SPID_ATK3]: "shotgn",
  [S_BSPI_ATK2]: "plasma",
  [S_CYBER_ATK2]: "rlaunc",
  [S_CYBER_ATK4]: "rlaunc",
  [S_CYBER_ATK6]: "rlaunc",
  [S_PAIN_ATK3]: "sklatk",
};

type ScreenMap = Record<number, [string, string]>;

const D2_SCREENS: ScreenMap = {
  6: ["SLIME16", C1TEXT],
  11: ["RROCK14", C2TEXT],
  20: ["RROCK07", C3TEXT],
  30: ["RROCK17", C4TEXT],
  15: ["RROCK13", C5TEXT],
  31: ["RROCK19", C6TEXT],
};
const TNT_SCREENS: ScreenMap = {
  6: ["SLIME16", T1TEXT],
  11: ["RROCK14", T2TEXT],
  20: ["RROCK07", T3TEXT],
  30: ["RROCK17", T4TEXT],
  15: ["RROCK13", T5TEXT],
  31: ["RROCK19", T6TEXT],
};
const PLUT_SCREENS: ScreenMap = {
  6: ["SLIME16", P1TEXT],
  11: ["RROCK14", P2TEXT],
  20: ["RROCK07", P3TEXT],
  30: ["RROCK17", P4TEXT],
  15: ["RROCK13", P5TEXT],
  31: ["RROCK19", P6TEXT],
};

export function commercialFinaleMap(mapn: number, secret: boolean): boolean {
  if (mapn === 6 || mapn === 11 || mapn === 20 || mapn === 30) return true;
  return secret && (mapn === 15 || mapn === 31);
}

function missionScreens(iwadPath: string): ScreenMap {
  const name = path.basename(iwadPath || "").toLowerCase();
  if (name.includes("tnt")) return TNT_SCREENS;
  if (name.includes("plut")) return PLUT_SCREENS;
  return D2_SCREENS;
}

export class Finale {
  done = false;
  action: "" | "worlddone" | "title" = "";

  private game: Game;
  private stage = STAGE_TEXT;
  private count = 0;
  private commercial: boolean;
  private text: string;
  private flat: string;
  private flatLump: Buffer | null = null;
  private art: Buffer | null = null;
  private pfub1: Buffer | null = null;
  private pfub2: Buffer | null = null;
  private bossback: Buffer | null = null;
  private lastBunnyStage = -1;
  private castnum = 0;
  private caststate = S_NULL;
  private casttics = 0;
  private castdeath = false;
  private castframes = 0;
  private castonmelee = 0;
  private castattacking = false;

  constructor(game: Game) {
    this.game = game;
    const commercial = game.wad.checkNumForName("MAP01") >= 0;
    this.commercial = commercial;
    if (commercial) {
      const screens = missionScreens(game.iwadPath);
      const pair = screens[game.mapn] ?? ["SLIME16", C1TEXT];
      this.flat = pair[0];
      this.text = pair[1];
      game.sound.changeMusic("read_m", true);
    } else {
      this.text = ({ 1: E1TEXT, 2: E2TEXT, 3: E3TEXT, 4: E4TEXT } as Record<number, string>)[game.episode] ?? E1TEXT;
      this.flat =
        ({ 1: "FLOOR4_8", 2: "SFLR6_1", 3: "MFLR8_4", 4: "MFLR8_3" } as Record<number, string>)[game.episode] ??
        "FLOOR4_8";
      game.sound.changeMusic("victor", true);
    }
    this.flatLump = this.lump(this.flat);
    let art: string;
    if (commercial) art = this.has("CREDIT") ? "CREDIT" : "HELP2";
    else if (game.episode === 2) art = "VICTORY2";
    else if (game.episode === 4) art = "ENDPIC";
    else art = this.has("CREDIT") ? "CREDIT" : "HELP2";
    this.art = this.lump(art) ?? this.lump("HELP1");
    if (game.episode === 3 && !commercial) {
      this.pfub1 = this.lump("PFUB1");
      this.pfub2 = this.lump("PFUB2");
    }
    this.bossback = this.lump("BOSSBACK");
  }

  ticker(): void {
    if (this.commercial && this.stage === STAGE_TEXT && this.count > 50 && this.wantSkip()) {
      if (this.game.mapn === 30) this.startCast();
      else {
        this.action = "worlddone";
        this.done = true;
        return;
      }
    }
    this.count++;
    if (this.stage === STAGE_CAST) {
      this.castTicker();
      return;
    }
    if (this.commercial) return;
    if (this.stage === STAGE_TEXT) {
      if (this.count > this.text.length * TEXTSPEED + TEXTWAIT) {
        this.stage = STAGE_ART;
        this.count = 0;
        this.game.forceWipe = true;
        if (this.game.episode === 3) this.game.sound.changeMusic("bunny", true);
      }
    } else if (this.stage === STAGE_ART) {
      const skipAfter = this.pfub1 !== null && this.pfub2 !== null ? 1130 : 10;
      if (this.wantSkip() && this.count > skipAfter) {
        this.done = true;
        this.action = "title";
      }
    }
  }

  responder(): boolean {
    if (this.stage !== STAGE_CAST || this.castdeath) return false;
    if (!this.wantSkip()) return false;
    const info = this.castInfo();
    this.castdeath = true;
    this.caststate = Number(info[MI_DEATHSTATE]);
    this.casttics = STATES[this.caststate]![2]!;
    if (this.casttics === -1) this.casttics = 15;
    this.castframes = 0;
    this.castattacking = false;
    return true;
  }

  draw(fb: Uint8Array): void {
    if (this.stage === STAGE_CAST) {
      this.drawCast(fb);
      return;
    }
    if (this.stage === STAGE_ART) {
      if (this.game.episode === 3 && this.pfub1 !== null && this.pfub2 !== null) this.drawBunny(fb);
      else if (this.art !== null) {
        fill(fb, 0);
        drawPatch(fb, 0, 0, this.art);
      }
      return;
    }
    this.drawText(fb);
  }

  private startCast(): void {
    this.game.forceWipe = true;
    this.castnum = 0;
    const info = MOBJINFO[CASTORDER[0]![1]]!;
    this.caststate = Number(info[MI_SEESTATE]);
    this.casttics = STATES[this.caststate]![2]!;
    this.castdeath = false;
    this.stage = STAGE_CAST;
    this.castframes = 0;
    this.castonmelee = 0;
    this.castattacking = false;
    this.game.sound.changeMusic("evil", true);
  }

  private castInfo(): (number | string)[] {
    return MOBJINFO[CASTORDER[this.castnum]![1]]!;
  }

  private stopAttack(): void {
    this.castattacking = false;
    this.castframes = 0;
    this.caststate = Number(this.castInfo()[MI_SEESTATE]);
  }

  private castTicker(): void {
    this.casttics--;
    if (this.casttics > 0) return;
    const st = STATES[this.caststate]!;
    if (st[2] === -1 || st[4] === S_NULL) {
      this.castnum++;
      this.castdeath = false;
      if (this.castnum >= CASTORDER.length) this.castnum = 0;
      this.caststate = Number(this.castInfo()[MI_SEESTATE]);
      this.castframes = 0;
    } else if (this.caststate === S_PLAY_ATK1) {
      this.stopAttack();
    } else {
      const nxt = st[4]!;
      this.caststate = nxt;
      this.castframes++;
      const sfx = CAST_SFX[nxt];
      if (sfx) this.game.sound.play(sfx);
    }
    if (this.castframes === 12) {
      this.castattacking = true;
      const info = this.castInfo();
      this.caststate = this.castonmelee ? Number(info[MI_MELEESTATE]) : Number(info[MI_MISSILESTATE]);
      this.castonmelee ^= 1;
      if (this.caststate === S_NULL) {
        this.caststate = this.castonmelee ? Number(info[MI_MELEESTATE]) : Number(info[MI_MISSILESTATE]);
      }
    }
    if (this.castattacking) {
      if (this.castframes === 24 || this.caststate === Number(this.castInfo()[MI_SEESTATE])) this.stopAttack();
    }
    this.casttics = STATES[this.caststate]![2]!;
    if (this.casttics === -1) this.casttics = 15;
  }

  private drawCast(fb: Uint8Array): void {
    fill(fb, 0);
    if (this.bossback !== null) drawPatch(fb, 0, 0, this.bossback);
    this.castPrint(fb, CASTORDER[this.castnum]![0]);
    const st = STATES[this.caststate]!;
    const spr = st[0]! >= 0 && st[0]! < SPRNAMES.length ? SPRNAMES[st[0]!]! : "";
    const found = this.game.res ? Sprites.lookupSprite(this.game.res, spr, 0, 0, st[1]! & FF_FRAMEMASK) : null;
    if (found === null) return;
    const [lump, flip] = found;
    const patch = this.game.wad.cacheLumpNum(lump);
    drawPatch(fb, 160, 170, patch, !!flip);
  }

  private castPrint(fb: Uint8Array, text: string): void {
    let width = 0;
    for (const ch of text) {
      const code = ch.toUpperCase().charCodeAt(0);
      if (ch === " " || code < HU_FONTSTART || code > HU_FONTEND) {
        width += 4;
        continue;
      }
      const p = this.font(code);
      if (p === null) {
        width += 4;
        continue;
      }
      width += patchSize(p)[0];
    }
    let cx = 160 - intdiv(width, 2);
    for (const ch of text) {
      const code = ch.toUpperCase().charCodeAt(0);
      if (ch === " " || code < HU_FONTSTART || code > HU_FONTEND) {
        cx += 4;
        continue;
      }
      const p = this.font(code);
      if (p === null) {
        cx += 4;
        continue;
      }
      const [w] = patchSize(p);
      drawPatch(fb, cx, 180, p);
      cx += w;
    }
  }

  private drawBunny(fb: Uint8Array): void {
    fill(fb, 0);
    const scroll = Math.max(0, Math.min(320, 320 - intdiv(this.count - 230, 2)));
    for (let x = 0; x < SCREENWIDTH; ++x) {
      const column = x + scroll;
      this.drawPatchColumn(fb, x, column < 320 ? this.pfub2! : this.pfub1!, column < 320 ? column : column - 320);
    }
    if (this.count < 1130) return;
    const stage = this.count < 1180 ? 0 : Math.min(6, intdiv(this.count - 1180, 5));
    if (stage > this.lastBunnyStage) {
      this.game.sound.play("pistol");
      this.lastBunnyStage = stage;
    }
    const patch = this.lump(`END${stage}`);
    if (patch !== null) drawPatch(fb, intdiv(320 - 104, 2), intdiv(200 - 64, 2), patch);
  }

  private drawPatchColumn(fb: Uint8Array, x: number, patch: Buffer, column: number): void {
    if (column < 0) return;
    const offsetPos = 8 + column * 4;
    if (offsetPos + 4 > patch.length) return;
    let offset = u32(patch, offsetPos);
    while (offset < patch.length && patch[offset] !== 255) {
      const top = patch[offset]!;
      const length = patch[offset + 1]!;
      const source = offset + 3;
      for (let i = 0; i < length && top + i < SCREENHEIGHT; ++i) fb[(top + i) * SCREENWIDTH + x] = patch[source + i]!;
      offset += length + 4;
    }
  }

  private fillFlat(fb: Uint8Array): void {
    const lump = this.flatLump;
    if (lump === null || lump.length < 4096) {
      fill(fb, 0);
      return;
    }
    for (let y = 0; y < 200; ++y) {
      const row = (y & 63) << 6;
      const dest = y * SCREENWIDTH;
      for (let x = 0; x < SCREENWIDTH; x += 64) {
        const n = Math.min(64, SCREENWIDTH - x);
        fb.set(lump.subarray(row, row + n), dest + x);
      }
    }
  }

  private drawText(fb: Uint8Array): void {
    this.fillFlat(fb);
    const nshow = intdiv(this.count, TEXTSPEED);
    let cx = 10;
    let cy = 10;
    for (let i = 0; i < this.text.length; ++i) {
      if (i >= nshow) break;
      const ch = this.text[i]!;
      if (ch === "\n") {
        cx = 10;
        cy += 11;
        continue;
      }
      const code = ch.toUpperCase().charCodeAt(0);
      if (ch === " " || code < HU_FONTSTART || code > HU_FONTEND) {
        cx += 4;
        continue;
      }
      const p = this.font(code);
      if (p === null) {
        cx += 4;
        continue;
      }
      const [w] = patchSize(p);
      if (cx + w > SCREENWIDTH) break;
      drawPatch(fb, cx, cy, p);
      cx += w;
    }
  }

  private font(code: number): Buffer | null {
    if (code - HU_FONTSTART < 0 || code - HU_FONTSTART >= HU_FONTSIZE) return null;
    return this.lump(`STCFN${String(code).padStart(3, "0")}`);
  }

  private wantSkip(): boolean {
    if (this.game.menu?.active) return false;
    if (this.game.mouseFire) return true;
    for (const key of [LCTRL, RCTRL, SPACE, RETURN, KP_ENTER, "e".charCodeAt(0)]) {
      if (this.game.keys[key]) return true;
    }
    return false;
  }

  private has(name: string): boolean {
    return this.game.wad.checkNumForName(name) >= 0;
  }

  private lump(name: string): Buffer | null {
    const n = this.game.wad.checkNumForName(name);
    return n < 0 ? null : this.game.wad.cacheLumpNum(n);
  }
}

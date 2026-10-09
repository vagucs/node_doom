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
 *
 * P_SetMobjState / P_MobjThinker / P_SpawnMobj (p_mobj.prg).
 */

import { Collision } from "./collision.ts";
import { asU32, intdiv } from "./compat.ts";
import {
  FRACUNIT,
  MF_AMBUSH,
  MF_COUNTKILL,
  MF_SKULLFLY,
  MF_SPAWNCEILING,
  MTF_AMBUSH,
  SK_NIGHTMARE,
  TICRATE,
} from "./defs.ts";
import { Enemy } from "./enemy.ts";
import {
  ACTIONS,
  MI_DAMAGE,
  MI_DOOMEDNUM,
  MI_FLAGS,
  MI_HEIGHT,
  MI_RADIUS,
  MI_REACTIONTIME,
  MI_SPAWNHEALTH,
  MI_SPAWNSTATE,
  MI_SPEED,
  MOBJINFO,
  MT_BRUISERSHOT,
  MT_HEADSHOT,
  MT_TFOG,
  MT_TROOPSHOT,
  S_NULL,
  S_SARG_PAIN2,
  S_SARG_RUN1,
  SPRNAMES,
  STATES,
} from "./info.ts";
import { Mobj } from "./mobj.ts";
import type { World } from "./world.ts";

export const ONFLOORZ = -0x80000000;
export const ONCEILINGZ = 0x7fffffff;

let sargTics: number[] | null = null;
let shotSpeed: Record<number, number> | null = null;

export class Thinker {
  static spawnMobj(world: World, x: number, y: number, z: number, typ: number, game: { skill?: number } | null = null): Mobj {
    const info = MOBJINFO[typ];
    const sub = Collision.pointInSubsector(world, x, y);
    const mo = new Mobj({
      x,
      y,
      z: 0,
      radius: Number(info[MI_RADIUS]),
      height: Number(info[MI_HEIGHT]),
      floorz: sub.sector!.floorheight,
      ceilingz: sub.sector!.ceilingheight,
      flags: Number(info[MI_FLAGS]),
      health: Number(info[MI_SPAWNHEALTH]),
      type: typ,
    });
    mo.doomednum = Number(info[MI_DOOMEDNUM]);
    mo.damage = Number(info[MI_DAMAGE]);
    mo.alive = true;
    if (game != null && (game.skill ?? 2) !== SK_NIGHTMARE) {
      mo.reactiontime = Number(info[MI_REACTIONTIME]);
    }
    mo.lastlook = Enemy.publicRandom() % 4;
    const flags = Number(info[MI_FLAGS]);
    if (z === ONCEILINGZ || ((flags & MF_SPAWNCEILING) && z === ONFLOORZ)) {
      mo.z = mo.ceilingz - mo.height;
    } else if (z === ONFLOORZ) {
      mo.z = mo.floorz;
    } else {
      mo.z = z;
    }
    world.mobjs.push(mo);
    Collision.setThingPosition(world, mo);
    // Vanilla does not call P_SetMobjState here: A_Look must wait until the
    // thinker advances, after P_SpawnMapThing has set the facing angle.
    const state = Number(info[MI_SPAWNSTATE]);
    const st = STATES[state]!;
    mo.istate = state;
    mo.tics = st[2];
    mo.sprite = SPRNAMES[st[0]] ?? "";
    mo.frame = st[1];
    return mo;
  }

  static removeMobj(world: World, mo: Mobj): void {
    Collision.unsetThingPosition(world, mo);
    mo.alive = false;
    mo.istate = S_NULL;
    mo.flags = 0;
    const i = world.mobjs.indexOf(mo);
    if (i >= 0) world.mobjs.splice(i, 1);
  }

  static setMobjState(mo: Mobj, state: number, world: World, game: unknown): boolean {
    let safety = 0;
    while (true) {
      if (state === S_NULL) {
        Thinker.removeMobj(world, mo);
        return false;
      }
      const st = STATES[state];
      mo.istate = state;
      mo.tics = st[2];
      mo.sprite = SPRNAMES[st[0]];
      mo.frame = st[1];
      const act = ACTIONS[st[3]];
      if (act) {
        Enemy.callAction(act, mo, world, game as never);
        if (!mo.alive) return false;
      }
      state = st[4];
      if (mo.tics !== 0) return true;
      if (++safety > 100) return true;
    }
  }

  static mobjThinker(world: World, mo: Mobj, game: {
    respawnmonsters?: boolean;
    leveltime?: number;
  }): void {
    if (mo.momx || mo.momy || (mo.flags & MF_SKULLFLY)) {
      Enemy.pXyMovement(world, mo, game as never);
      if (!mo.alive) return;
    }
    if (mo.z !== mo.floorz || mo.momz) {
      Enemy.mobjZ(mo, world, game as never);
      if (!mo.alive) return;
    }
    if (mo.tics !== -1) {
      mo.tics -= 1;
      if (mo.tics <= 0) Thinker.setMobjState(mo, STATES[mo.istate][4], world, game);
      return;
    }
    if ((mo.flags & MF_COUNTKILL) === 0) return;
    if (!game.respawnmonsters) return;
    mo.movecount += 1;
    if (mo.movecount < 12 * TICRATE) return;
    if (((game.leveltime ?? 0) & 31) !== 0) return;
    if (Enemy.publicRandom() > 4) return;
    Thinker.nightmareRespawn(world, mo, game as never);
  }

  static nightmareRespawn(world: World, mo: Mobj, game: { startSound: (n: string) => void }): void {
    const sp = mo.spawnpoint as { x: number; y: number; angle: number; options: number } | null;
    if (sp == null) return;
    const x = sp.x * FRACUNIT;
    const y = sp.y * FRACUNIT;
    const chk = Collision.checkPosition(world, mo, x, y);
    if (chk.blocked) return;
    Thinker.spawnMobj(world, mo.x, mo.y, mo.floorz, MT_TFOG, game as never);
    game.startSound("telept");
    const sub = Collision.pointInSubsector(world, x, y);
    Thinker.spawnMobj(world, x, y, sub.sector!.floorheight, MT_TFOG, game as never);
    game.startSound("telept");
    const z = (Number(MOBJINFO[mo.type][MI_FLAGS]) & MF_SPAWNCEILING) ? ONCEILINGZ : ONFLOORZ;
    const spawned = Thinker.spawnMobj(world, x, y, z, mo.type, game as never);
    spawned.spawnpoint = sp;
    spawned.angle = asU32(intdiv(sp.angle, 45) * 0x20000000);
    if (sp.options & MTF_AMBUSH) spawned.flags |= MF_AMBUSH;
    spawned.reactiontime = 18;
    Thinker.removeMobj(world, mo);
  }

  static applyFast(game: {
    fastparm?: boolean;
    skill: number;
    respawnparm?: boolean;
    respawnmonsters?: boolean;
    _fastOn?: boolean | null;
  }): void {
    const want = Boolean(game.fastparm || game.skill === SK_NIGHTMARE);
    game.respawnmonsters = game.skill === SK_NIGHTMARE || Boolean(game.respawnparm);
    if (game._fastOn === want) return;
    if (sargTics == null) {
      sargTics = [];
      for (let i = S_SARG_RUN1; i <= S_SARG_PAIN2; i++) sargTics.push(STATES[i][2]);
      shotSpeed = {
        [MT_BRUISERSHOT]: Number(MOBJINFO[MT_BRUISERSHOT][MI_SPEED]),
        [MT_HEADSHOT]: Number(MOBJINFO[MT_HEADSHOT][MI_SPEED]),
        [MT_TROOPSHOT]: Number(MOBJINFO[MT_TROOPSHOT][MI_SPEED]),
      };
    }
    game._fastOn = want;
    sargTics.forEach((base, i) => {
      STATES[S_SARG_RUN1 + i][2] = want ? Math.max(1, intdiv(base, 2)) : base;
    });
    const fast = 20 * FRACUNIT;
    for (const [mt, spd] of Object.entries(shotSpeed!)) {
      MOBJINFO[Number(mt)][MI_SPEED] = want ? fast : spd;
    }
  }
}

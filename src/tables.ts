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

import { asU32, intdiv } from "./compat.ts";
import {
  ANGLETOFINESHIFT,
  FINEANGLES,
  FINEMASK,
  FRACUNIT,
  SLOPERANGE,
} from "./defs.ts";

export const finesine: number[] = [];
export const finecosine: number[] = [];
export const finetangent: number[] = [];
export const tantoangle: number[] = [];

export function initTables(): void {
  if (finesine.length) return;
  const sinCount = intdiv(FINEANGLES, 4) * 5;
  for (let i = 0; i < sinCount; i++) {
    const a = (i + 0.5) * Math.PI * 2.0 / FINEANGLES;
    finesine[i] = FRACUNIT * Math.sin(a) | 0;
  }
  finecosine.push(...finesine.slice(intdiv(FINEANGLES, 4)));
  const tanCount = intdiv(FINEANGLES, 2);
  for (let i = 0; i < tanCount; i++) {
    const a = (i - intdiv(FINEANGLES, 4) + 0.5) * Math.PI * 2.0 / FINEANGLES;
    let raw = FRACUNIT * Math.tan(a);
    let value: number;
    if (!Number.isFinite(raw)) value = a > 0 ? 0x7fffffff : -0x7fffffff;
    else if (raw > 0x7fffffff) value = 0x7fffffff;
    else if (raw < -0x7fffffff) value = -0x7fffffff;
    else value = raw | 0;
    finetangent[i] = value;
  }
  for (let i = 0; i <= SLOPERANGE; i++) {
    tantoangle[i] = asU32(Math.atan(i / SLOPERANGE) / (Math.PI * 2.0) * 0xffffffff);
  }
}

export function fineSin(angle: number): number {
  initTables();
  const index = (asU32(angle) >>> ANGLETOFINESHIFT) & FINEMASK;
  return finesine[index]!;
}

export function fineCos(angle: number): number {
  initTables();
  const index = ((asU32(angle) >>> ANGLETOFINESHIFT) + intdiv(FINEANGLES, 4)) & FINEMASK;
  return finesine[index]!;
}

export function slopeDiv(num: number, den: number): number {
  if (den < 512) return SLOPERANGE;
  const answer = intdiv(num << 3, den >> 8);
  return answer > SLOPERANGE ? SLOPERANGE : answer;
}

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

import { FRACBITS } from "./defs.ts";

export const MASK32 = 0xffffffff;

export function asU32(n: number): number {
  return n >>> 0;
}

export function asI32(n: number): number {
  return n | 0;
}

export function ushr(n: number, bits: number): number {
  n = asU32(n);
  if (bits <= 0) return n;
  if (bits >= 32) return 0;
  return n >>> bits;
}

export function shar(n: number, bits: number): number {
  n = asI32(n);
  if (bits <= 0) return n;
  if (bits >= 31) return n < 0 ? -1 : 0;
  return n >> bits;
}

/** 16.16 multiply with a 64-bit intermediate (JS Number overflows 2^53). */
export function fixedMul(a: number, b: number): number {
  return asI32(Number((BigInt(asI32(a)) * BigInt(asI32(b))) >> BigInt(FRACBITS)));
}

export function fixedDiv(a: number, b: number): number {
  a = asI32(a);
  b = asI32(b);
  if (b === 0) return a >= 0 ? 0x7fffffff : -0x80000000;
  const absA = a < 0 ? -a : a;
  const absB = b < 0 ? -b : b;
  if (absA >> 14 >= absB) return (a ^ b) < 0 ? -0x80000000 : 0x7fffffff;
  return asI32(Number((BigInt(a) << 16n) / BigInt(b)));
}

export function absFixed(n: number): number {
  n = asI32(n);
  return n < 0 ? -n : n;
}

export function intdiv(a: number, b: number): number {
  if (b === 0) return 0;
  return Math.trunc(a / b);
}

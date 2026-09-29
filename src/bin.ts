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

import { asI32 } from "./compat.ts";

export function i16(data: Buffer | Uint8Array, off: number): number {
  const value = u16(data, off);
  return value >= 0x8000 ? value - 0x10000 : value;
}

export function u16(data: Buffer | Uint8Array, off: number): number {
  return data[off]! | (data[off + 1]! << 8);
}

export function u32(data: Buffer | Uint8Array, off: number): number {
  return (
    (data[off]! |
      (data[off + 1]! << 8) |
      (data[off + 2]! << 16) |
      (data[off + 3]! << 24)) >>>
    0
  );
}

export function i32(data: Buffer | Uint8Array, off: number): number {
  return asI32(u32(data, off));
}

export function name8(data: Buffer | Uint8Array | string, off = 0): string {
  let raw: string;
  if (typeof data === "string") {
    raw = data.slice(off, off + 8);
  } else {
    raw = Buffer.from(data.subarray(off, off + 8)).toString("latin1");
  }
  const nul = raw.indexOf("\0");
  if (nul >= 0) raw = raw.slice(0, nul);
  return raw.replace(/ +$/g, "").toUpperCase();
}

export function ord(data: Buffer | Uint8Array | string, off: number): number {
  if (typeof data === "string") return data.charCodeAt(off) & 0xff;
  return data[off]! & 0xff;
}

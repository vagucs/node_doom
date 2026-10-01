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

export const TAB = 9;
export const ESC = 27;
export const RETURN = 13;
export const SPACE = 32;
export const BACKSPACE = 8;

export const F1 = 0x4000003a;
export const F2 = 0x4000003d;
export const F3 = 0x4000003e;
export const F11 = 0x40000044;
export const LEFT = 0x40000050;
export const RIGHT = 0x4000004f;
export const UP = 0x40000052;
export const DOWN = 0x40000051;
export const LSHIFT = 0x400000e1;
export const RSHIFT = 0x400000e5;
export const LCTRL = 0x400000e0;
export const RCTRL = 0x400000e4;
export const LALT = 0x400000e2;
export const RALT = 0x400000e6;
export const PLUS = 43;
export const EQUALS = 61;
export const MINUS = 45;
export const COMMA = 44;
export const PERIOD = 46;
export const KP_PLUS = 0x40000057;
export const KP_MINUS = 0x40000056;
export const KP_ENTER = 0x40000058;

export function isMinus(key: number): boolean {
  return key === MINUS || key === KP_MINUS;
}

export function isPlus(key: number): boolean {
  return key === PLUS || key === EQUALS || key === KP_PLUS;
}

export function letter(ch: string): number {
  return ch.toLowerCase().charCodeAt(0);
}

export function digit(n: number): number {
  return String(Math.max(0, Math.min(9, n))).charCodeAt(0);
}

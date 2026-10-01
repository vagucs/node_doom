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
import type { Game } from "./game.ts";

export function configPath(): string {
  return path.join(process.cwd(), "default.cfg");
}

export function load(game: Game): void {
  const filePath = configPath();
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return;
  let lines: string[];
  try {
    lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  } catch {
    return;
  }
  for (const raw of lines) {
    const line = raw.split("#", 1)[0]!.trim();
    if (!line) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 2) continue;
    const key = parts[0]!;
    const n = parseInt(parts[1]!, 10);
    if (!Number.isFinite(n)) continue;
    if (key === "mouse_sensitivity") game.mouseSensitivity = Math.max(0, Math.min(9, n));
    else if (key === "sfx_volume") game.sound.sfxVolume = Math.max(0, Math.min(15, n));
    else if (key === "music_volume") game.sound.musicVolume = Math.max(0, Math.min(15, n));
    else if (key === "show_messages") game.showMessages = n !== 0;
    else if (key === "use_mouse") game.useMouse = n !== 0;
    else if (key === "screenblocks") game.screenSize = Math.max(0, Math.min(8, n - 3));
  }
}

export function save(game: Game): void {
  const filePath = configPath();
  try {
    fs.writeFileSync(
      filePath,
      `mouse_sensitivity\t\t${game.mouseSensitivity | 0}\n` +
        `sfx_volume\t\t${game.sound.sfxVolume | 0}\n` +
        `music_volume\t\t${game.sound.musicVolume | 0}\n` +
        `show_messages\t\t${game.showMessages ? 1 : 0}\n` +
        `use_mouse\t\t${game.useMouse ? 1 : 0}\n` +
        `screenblocks\t\t${(game.screenSize | 0) + 3}\n`,
      "utf8",
    );
  } catch {
    /* ignore */
  }
}

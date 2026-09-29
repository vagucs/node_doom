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

import { u16 } from "./bin.ts";

/** MUS lump -> Standard MIDI File (Chocolate Doom mus2mid.c). */
export class Mus2Mid {
  body: number[] = [];
  queued = 0;
  tracksize = 0;
  velocities: number[];
  channelMap: number[];

  constructor() {
    this.velocities = new Array(16).fill(127);
    this.channelMap = new Array(16).fill(-1);
  }

  writeTime(time: number): void {
    let buffer = time & 0x7f;
    let working = time;
    while ((working >>= 7) !== 0) {
      buffer <<= 8;
      buffer |= (working & 0x7f) | 0x80;
    }
    while (true) {
      this.body.push(buffer & 0xff);
      ++this.tracksize;
      if ((buffer & 0x80) !== 0) {
        buffer >>= 8;
      } else {
        this.queued = 0;
        return;
      }
    }
  }

  write(data: number[]): void {
    this.writeTime(this.queued);
    for (const b of data) this.body.push(b & 0xff);
    this.tracksize += data.length;
  }

  private allocateChannel(): number {
    let result = Math.max(...this.channelMap) + 1;
    if (result === 9) ++result;
    return result;
  }

  midiChannel(musChannel: number): number {
    if (musChannel === 15) return 9;
    if (this.channelMap[musChannel] === -1) {
      this.channelMap[musChannel] = this.allocateChannel();
      const channel = this.channelMap[musChannel]!;
      this.write([0xb0 | channel, 0x7b, 0]);
    }
    return this.channelMap[musChannel]!;
  }
}

export function mus2mid(mus: Buffer): Buffer | null {
  if (mus.length >= 4 && mus.toString("latin1", 0, 4) === "MThd") return mus;
  if (mus.length < 16 || mus.toString("latin1", 0, 4) !== "MUS\x1a") return null;

  const controllerMap = [
    0x00, 0x20, 0x01, 0x07, 0x0a, 0x0b, 0x5b, 0x5d, 0x40, 0x43, 0x78, 0x7b, 0x7e, 0x7f, 0x79,
  ];
  const midiHeader = Buffer.from([
    0x4d, 0x54, 0x68, 0x64, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, 0x01, 0x00, 0x46, 0x4d, 0x54,
    0x72, 0x6b, 0x00, 0x00, 0x00, 0x00,
  ]);
  let position = u16(mus, 6);
  const length = mus.length;
  const output = new Mus2Mid();
  let hitScoreEnd = false;

  const readU8 = (): number | null => {
    if (position >= length) return null;
    return mus[position++]!;
  };

  while (!hitScoreEnd) {
    inner: while (!hitScoreEnd) {
      const descriptor = readU8();
      if (descriptor === null) return null;
      const channel = output.midiChannel(descriptor & 0x0f);
      const event = descriptor & 0x70;

      switch (event) {
        case 0x00: {
          const key = readU8();
          if (key === null) return null;
          output.write([0x80 | channel, key & 0x7f, 0]);
          break;
        }
        case 0x10: {
          const key = readU8();
          if (key === null) return null;
          if ((key & 0x80) !== 0) {
            const velocity = readU8();
            if (velocity === null) return null;
            output.velocities[channel] = velocity & 0x7f;
          }
          output.write([0x90 | channel, key & 0x7f, output.velocities[channel]!]);
          break;
        }
        case 0x20: {
          const key = readU8();
          if (key === null) break inner;
          const wheel = key * 64;
          output.write([0xe0 | channel, wheel & 0x7f, (wheel >> 7) & 0x7f]);
          break;
        }
        case 0x30: {
          const controller = readU8();
          if (controller === null || controller < 10 || controller > 14) return null;
          output.write([0xb0 | channel, controllerMap[controller]!, 0]);
          break;
        }
        case 0x40: {
          const controller = readU8();
          const value = readU8();
          if (controller === null || value === null) return null;
          if (controller === 0) {
            output.write([0xc0 | channel, value & 0x7f]);
          } else {
            if (controller < 1 || controller > 9) return null;
            const working = (value & 0x80) !== 0 ? 0x7f : value;
            output.write([0xb0 | channel, controllerMap[controller]!, working]);
          }
          break;
        }
        case 0x60:
          hitScoreEnd = true;
          break;
        default:
          return null;
      }
      if ((descriptor & 0x80) !== 0) break inner;
    }

    if (!hitScoreEnd) {
      let timeDelay = 0;
      let working: number | null;
      do {
        working = readU8();
        if (working === null) return null;
        timeDelay = timeDelay * 128 + (working & 0x7f);
      } while ((working & 0x80) !== 0);
      output.queued += timeDelay;
    }
  }

  output.writeTime(output.queued);
  output.body.push(0xff, 0x2f, 0x00);
  output.tracksize += 3;
  midiHeader[18] = (output.tracksize >> 24) & 0xff;
  midiHeader[19] = (output.tracksize >> 16) & 0xff;
  midiHeader[20] = (output.tracksize >> 8) & 0xff;
  midiHeader[21] = output.tracksize & 0xff;
  return Buffer.concat([midiHeader, Buffer.from(output.body)]);
}

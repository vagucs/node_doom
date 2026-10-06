# node_doom

![DOOM rodando em Node.js CLI com SDL2](screenshot/doom.png)

**Vídeo:** [DOOM rodando em Node.js](https://youtu.be/EkCBuIzdHHc)

DOOM generic portado de Harbour para **Node.js 20+ CLI + SDL2** (koffi). Não é aplicação web nem Electron.

Por **Wagner Nunes da Silva**

- vagucs@bol.com.br
- vagucs@vagucs.com.br
- vagucs@gmail.com
- [www.vagucs.com.br](https://www.vagucs.com.br)
- [LinkedIn](https://www.linkedin.com/in/wagner-nunes-da-silva-b0a15360)

O mesmo motor em outras linguagens: [harbour_doom](https://github.com/vagucs/harbour_doom) · [python_doom](https://github.com/vagucs/python_doom) · [php_doom](https://github.com/vagucs/php_doom) · [node_doom](https://github.com/vagucs/node_doom) · [java_doom](https://github.com/vagucs/java_doom)

Esta árvore é um port de **[harbour_doom](https://github.com/vagucs/harbour_doom)** (`doom_hb`): o mesmo motor Chocolate Doom / doomgeneric que primeiro foi de C para Harbour, depois para [Python](https://github.com/vagucs/python_doom) e [PHP](https://github.com/vagucs/php_doom), agora de Harbour para Node.js / TypeScript.

Cada fonte leva o mesmo cabeçalho de autor dos `.prg` Harbour.

English version: [README.md](README.md)

---

## O que é este projeto

O motor do Chocolate Doom / doomgeneric foi traduzido para **Harbour** (`.prg` / `.ch`) com uma camada fina de C para Allegro 4.2.2. Esse trabalho está em [github.com/vagucs/harbour_doom](https://github.com/vagucs/harbour_doom). Este diretório é o **mesmo material de estudo**, em TypeScript:

- Janela, teclas, PCM: **SDL2** via **koffi** (sem navegador, sem HTTP, sem Electron)
- Framebuffer: 320×200, 8 bits PLAYPAL, `Uint8Array`, escalado na janela
- Tic do jogo: 35 Hz (`TICRATE`), igual ao vanilla
- Renderer: BSP, visplanes, `R_DrawColumn` / `R_DrawSpan`, ponto fixo 16.16 `fixedMul` / `fixedDiv` (intermediários BigInt)
- Mapa: VERTEXES, LINEDEFS, SIDEDEFS, SECTORS, SEGS, SSECTORS, NODES, THINGS, BLOCKMAP, REJECT
- Jogo: andar, portas, plataformas, interruptores, teleports, saída, itens, armas (incluindo motosserra subindo/cortando), barra de status, automap com Tab, som DS*, música MUS→MIDI, menu ESC (opções, load/save), totalização no intermission, wipe derretendo, bunny scroll, inimigos em look/chase/ataque

É necessário um IWAD legal (shareware `doom1.wad` ou comercial `doom.wad` / `doom2.wad` / etc.). Este repositório não distribui WAD comercial.

É um **port completo de jogabilidade** do motor Harbour para Node (os mesmos sistemas da árvore PHP acabada, inclusive teleports, cheats extras, `P_ChangeSector` nas plataformas e Screen Size com `-/+`). A contagem de arquivos é condensada frente aos 100+ `.prg`; o comportamento segue as fontes Harbour.

O que não entra nesta árvore (o mesmo corte do `boot.prg` Harbour):

- Rede, música de CD, joystick
- Quantização de paleta `-colors` (experimento só no Harbour)

---

## Proposta educacional

Este projeto é, antes de tudo, um **material de estudo**. O DOOM (1993) é pequeno o bastante para ser lido de ponta a ponta e denso o bastante para ensinar engenharia de verdade: renderização por BSP, ponto fixo 16.16, laço por tics, sistema de arquivos WAD.

O port Harbour ensinou a ler C com os olhos de outra linguagem. O Python tirou o pré-processador e os arrays 1-based. O PHP tornou a fronteira nativa **FFI para SDL2**. Este port Node mantém essa ideia e acrescenta outra lição: **`Number` em JavaScript não é um int de 32 bits**. Produtos que passam de 2^53 precisam de `BigInt` (`fixedMul` / `fixedDiv` em `src/compat.ts`).

O que o port pretende ensinar:

- **Seis linguagens, um motor.** C (`base_c/` no harbour_doom) → Harbour ([harbour_doom](https://github.com/vagucs/harbour_doom)) → Python ([python_doom](https://github.com/vagucs/python_doom)) → PHP ([php_doom](https://github.com/vagucs/php_doom)) → TypeScript ([node_doom](https://github.com/vagucs/node_doom)) → Java ([java_doom](https://github.com/vagucs/java_doom)). Os mesmos nomes (`P_Thrust`, `R_DrawColumn`, `A_Look`) para abrir as versões lado a lado.
- **O que os ponteiros faziam.** TypeScript usa objetos e typed arrays; wrap-around, ângulos BAM e overflow 16.16 ficam explícitos (`asU32`, `shar`, `fixedMul`) porque números JS não estouram em 32 bits.
- **Onde um interpretador basta.** O jogo inteiro roda em Node. SDL2 só abre janela, lê teclado e enfileira PCM. koffi é a fronteira nativa, como o Allegro foi no Harbour e o FFI no PHP.
- **CLI, não HTTP.** Não há canvas no navegador nem servidor web.
- **Modernização de legado.** Manter o comportamento idêntico, isolar a camada nativa, conferir contra o original.

Sugestão de roteiro:

1. Rode o jogo e leia `doom.ts` e `src/game.ts` — boot, tic, input.
2. Compare `src/compat.ts` com o Harbour `xhb_compat.prg` / `m_fixed.prg`, o Python `doom/compat.py` e o PHP `src/Compat.php`.
3. Abra `src/render.ts` ao lado de `r_main.prg` / `r_bsp.prg` / `r_segs.prg` / `r_draw.prg`.
4. Siga uma porta a partir do **Espaço** até `src/specials.ts`.
5. Siga um tiro a partir do **Ctrl** em `src/player.ts` até `Collision.lineAttack` e `Enemy`.

---

## De C / Harbour / Python / PHP para Node

Arrays em TypeScript são 0-based, como o C, o Python, o PHP e o Java. Arrays Harbour eram 1-based; esse deslocamento some aqui.

A tabela abaixo é a mesma comparação em seis linguagens usada em todos os README `*_doom`:

| DOOM em C | [Harbour](https://github.com/vagucs/harbour_doom) | [Python](https://github.com/vagucs/python_doom) | [PHP](https://github.com/vagucs/php_doom) | [Node](https://github.com/vagucs/node_doom) | [Java](https://github.com/vagucs/java_doom) |
|---|---|---|---|---|---|
| `struct` / `typedef struct` | `CLASS ... DATA` | `@dataclass` | `class` + propriedades tipadas | `class` + campos tipados | `class` + campos |
| `thing->x` | `thing:x` | `thing.x` | `$thing->x` | `thing.x` | `thing.x` |
| `NULL` | `NIL` | `None` | `null` | `null` | `null` |
| `array[0]` | `array[1]` | `array[0]` | `$array[0]` | `array[0]` | `array[0]` |
| `&`, `\|`, `^` | `hb_qbitAnd/Or/Xor` | `&`, `\|`, `^` | `&`, `\|`, `^` | `&`, `\|`, `^` | `&`, `\|`, `^` |
| `x >> n` sem sinal | `UShr(x, n)` | `ushr(x, n)` | `Compat::ushr($x, $n)` | `ushr(x, n)` | `Compat.ushr` / `>>>` |
| `x >> n` com sinal | `Shar(x, n)` | `shar(x, n)` | `Compat::shar($x, $n)` | `shar(x, n)` | `Compat.shar` / `>>` |
| estouro de 32 bits | `AsU32` / `AsInt32` | `as_u32` / `as_i32` | `Compat::asU32` / `asI32` | `asU32` / `asI32` | `int` já faz wrap |
| `fixed_t` 16.16 | `FixedMul` / `FixedDiv` | `fixed_mul` / `fixed_div` | `Compat::fixedMul` / `fixedDiv` | `fixedMul` / `fixedDiv` (BigInt) | `fixedMul` / `fixedDiv` (`long`) |
| framebuffer `byte *` | string Harbour | `bytearray` + LUT numpy | `array<int>` + SDL ARGB8888 | `Uint8Array` + SDL ARGB8888 | `int[]` + SDL ARGB8888 |
| Allegro 4.2.2 | GTALLEG / llibg | pygame | SDL2 via FFI | SDL2 via koffi | SDL2 via JNA |
| `Z_Malloc` | GC | GC | GC | GC | GC |
| globais `PUBLIC` | `PUBLIC` / `MEMVAR` | campos em `Game` | campos públicos em `Game` | campos públicos em `Game` | campos públicos em `Game` |
| 100+ arquivos `.prg` | 1:1 com o C | `doom/*.py` condensado | `src/*.php` condensado | `src/*.ts` condensado | `src/doom/*.java` condensado |

### Lado a lado: `P_Thrust`

C (`base_c/p_user.c` no harbour_doom):

```c
void P_Thrust (player_t* player, angle_t angle, fixed_t move)
{
    angle >>= ANGLETOFINESHIFT;
    player->mo->momx += FixedMul(move,finecosine[angle]);
    player->mo->momy += FixedMul(move,finesine[angle]);
}
```

Harbour (`p_user.prg`):

```harbour
PROCEDURE P_Thrust( player, angle, move )
    angle := UShr( angle, ANGLETOFINESHIFT )
    player:mo:momx += FixedMul( move, finecosine[ angle + 1 ] )
    player:mo:momy += FixedMul( move, finesine[ angle + 1 ] )
RETURN
```

Python (`doom/player.py`):

```python
def thrust(mo, angle, move):
    mo.momx += fixed_mul(move, fine_cos(angle))
    mo.momy += fixed_mul(move, fine_sin(angle))
```

PHP (`src/Player.php`):

```php
public static function thrust(Mobj $mo, int $angle, int $move): void
{
    $mo->momx += Compat::fixedMul($move, Tables::fineCos($angle));
    $mo->momy += Compat::fixedMul($move, Tables::fineSin($angle));
}
```

TypeScript (`src/player.ts`):

```typescript
static thrust(mo: Mobj, angle: number, move: number): void {
  mo.momx += fixedMul(move, fineCos(angle));
  mo.momy += fixedMul(move, fineSin(angle));
}
```

`.` continua `.` (como no Python), o shift sem sinal fica em `fineCos`, e o `+ 1` do índice Harbour desaparece. `fixedMul` usa `BigInt` para o produto 32×32→64 ficar exato.

---

## O que permanece nativo, e por quê

TypeScript **é** o motor. Código nativo fica só onde o Node não fala com a janela do sistema nem com o mixer.

| Peça | API nativa | Por quê |
|---|---|---|
| `src/video.ts` | SDL2 via **koffi** | Janela, teclado, blit ARGB8888, fila PCM. O mesmo papel do Allegro no Harbour e do FFI no PHP |
| `src/sound.ts` | winmm MCI via **koffi** (Windows) | Playback MUS→MIDI (`mus2mid.ts` continua em TypeScript) |
| `lib/SDL2.dll` | SDL2 64 bits | Biblioteca solta; `SDL2_PATH` substitui o caminho |

Não há passo de compilação do motor. O `tsx` executa os `.ts` direto.

---

## Tecnologia

| Camada | Este port | Harbour (`harbour_doom`) |
|---|---|---|
| Linguagem | TypeScript ESM, Node 20+ (testado no 24.19.0 / npm 11.17.0) | Harbour / xHarbour |
| Janela, teclas, PCM | SDL2 (koffi) | Allegro 4.2.2 + GTALLEG |
| Blit da paleta / CRT | laço JS → `SDL_UpdateTexture` ARGB8888 | C em `doomgeneric_allegro.prg` |
| MIDI (Windows) | winmm MCI (koffi) | Allegro MIDI / MCI |
| IWAD | os mesmos lumps | os mesmos |
| Build | nenhum (`npx tsx doom.ts` ou `run.bat`) | `compile.bat` / `hbmk2` |

Node necessário:

```
node >= 20
npm install
```

SDL2: coloque **SDL2.dll** (64 bits) em `lib/` no Windows, ou defina `SDL2_PATH`. Dá para copiar o `php_doom/lib/SDL2.dll` do port PHP. Veja `lib/README.txt`.

---

## Desempenho

Taxa típica de desenho no mesmo PC (320×200, janela, IWAD shareware). O jogo continua em 35 Hz (`TICRATE`); `-fps` mostra esse número.

| Port | FPS típico |
|---|---|
| Harbour (`doom_hb`) | ~12 |
| Python (`python_doom`) | ~8 |
| PHP (`php_doom`) | ~20 |
| Node (`node_doom`) | ~100 |
| Java (`java_doom`) | ~180 (travado no vsync) |

---

## Como rodar

Node 20+, `npm install` uma vez, SDL2 no path (ou `node_doom/lib/SDL2.dll` no Windows). Neste diretório:

```
npm install
npx tsx doom.ts
npx tsx doom.ts -iwad DOOM1.WAD
npx tsx doom.ts -iwad ..\DOOM1.WAD -warp 1 1 -fps
npx tsx doom.ts -iwad DOOM1.WAD -crt
npm start
```

Atalho Windows — o `run.bat` faz `npm install` se precisar, copia o SDL2 de `php_doom/lib` quando faltar, e se você omitir `-iwad` procura `DOOM1.WAD` aqui ou na pasta pai `doom_minimal`:

```
run.bat
run.bat -fps
run.bat -iwad ..\DOOM1.WAD -warp 1 1 -crt
```

Linux: `sudo apt install libsdl2-2.0-0` e depois `npm install && npx tsx doom.ts`

macOS: `brew install sdl2` e depois `npm install && npx tsx doom.ts`

Sem `-iwad` procura um argumento `.wad`, depois `doom1.wad` / `DOOM1.WAD` / `doom.wad` / `doom2.wad` no diretório atual, em `DOOMWADDIR`, nesta pasta e na pasta pai `doom_minimal`.

---

## Teclas

Controles clássicos do DOOM (este port condensado; sem remap via `default.cfg`).

### Movimento e ações

| Tecla | Ação |
|---|---|
| Setas | Frente, trás, girar |
| **Shift** | Correr |
| **Alt** | Strafe (segurar) |
| **,** / **.** | Strafe esquerda / direita |
| **Ctrl** | Atirar (segurar repete; animação da arma + `A_ReFire`) |
| **Espaço** / **E** | Usar / abrir porta |
| **1** | Punho / motosserra (alterna) |
| **2**–**7** | Pistola, shotgun, chaingun, foguete, plasma, BFG |
| **Enter** | Começar a partir do título |
| **Tab** | Liga/desliga o automap |

O movimento usa **somente as setas** (sem WASD), para as letras ficarem livres para os cheats.

### Automap (com o mapa aberto)

| Tecla | Ação |
|---|---|
| Setas | Mover o mapa |
| **+** / **-** | Zoom |
| **0** | Encaixa / zoom máximo |
| **F** | Seguir o player |
| **G** | Grade |
| **M** | Marcar posição |
| **C** | Limpar marcas |
| **Tab** | Fecha o mapa |
| **IDDT** | Cheat: todas as paredes, depois os things (digite com o mapa aberto) |

### Menu e teclas de função

| Tecla | Ação |
|---|---|
| **Esc** | Menu |
| **Enter** | Confirmar / avançar |
| **Backspace** | Voltar |
| **Y** / **N** | Sim / Não |
| **F2** | Salvar |
| **F3** | Carregar |
| **F11** | Liga/desliga o overlay de FPS |
| **+** / **-** | Screen Size (o mesmo de Options) com o automap fechado |
| **Alt+Enter** | Tela cheia |

As opções **Screen Size** e **Graphic Detail** (HIGH/LOW) mudam a vista 3D (`R_SetViewSize`), não a escala da janela. Escala da janela: arraste a janela ou Alt+Enter.

### Cheats (só nostalgia)

Digite no teclado durante o jogo; não precisa de Enter. No skill Nightmare só **IDCLEV** e **IDDT** funcionam (vanilla).

| Código | Efeito |
|---|---|
| **IDDQD** | Modo Deus (_Degreelessness Mode_); face do HUD `STFGOD0` |
| **IDKFA** | Todas as armas, munição, chaves e armadura |
| **IDFA** | Armas, munição e armadura (sem chaves) |
| **IDCLIP** / **IDSPISPOPD** | Sem colisão |
| **IDDT** | Cheat do automap (digite com o mapa aberto): todas as paredes, depois os things |
| **IDBEHOLD** | Lista os power-ups; em seguida **V** invulnerabilidade, **S** berserk, **I** invisibilidade, **R** traje anti-radiação, **A** mapa do computador, **L** visor de luz |
| **IDCHOPPERS** | Motosserra |
| **IDMYPOS** | Mostra ângulo e coordenadas |
| **IDCLEV** + 2 dígitos | Warp (`11` = E1M1 ou MAP11) |
| **IDMUS** + 2 dígitos | Troca a música (`11` = faixa de E1M1 / MAP11) |

---

## Parâmetros de linha de comando

### IWAD

| Parâmetro | Descrição |
|---|---|
| `-iwad arquivo.wad` | IWAD a carregar (caminho ou só o nome) |
| `arquivo.wad` | Mesmo efeito, sem `-iwad` |

### Vídeo

| Parâmetro | Descrição |
|---|---|
| `-fullscreen` | Começa em janela de tela cheia |
| `-crt` | Visual de scanlines (família Harbour `-crt`). Fica nítido em escala 2× ou maior |
| `-fps` | Mostra os quadros por segundo no HUD (canto superior direito) e no título da janela. **F11** liga/desliga |

### Jogo

| Parâmetro | Descrição |
|---|---|
| `-warp e m` | Pula o título e começa no episódio `e` mapa `m` |
| `-skill n` | 0 baby … 4 nightmare (padrão 2, Hurt Me Plenty) |
| `-nomonsters` | Não spawna inimigos |
| `-fast` | Monstros mais rápidos (vanilla `-fast`) |
| `-respawn` | Respawn estilo nightmare |
| `-file wad [wad…]` | PWADs extras depois do IWAD |
| `-record nome` | Grava demo em `nome.lmp` |
| `-playdemo nome` | Toca lump ou `.lmp` e sai |
| `-timedemo nome` | Playback o mais rápido possível e imprime FPS |
| `-nosound` | Desliga SFX e música |
| `-nomusic` | Desliga só a música |

`default.cfg` no diretório de trabalho guarda `mouse_sensitivity`, `sfx_volume`, `music_volume`, `show_messages`, `use_mouse`, `screenblocks`. Mouse virar/andar usa movimento relativo do SDL2 quando `use_mouse` está ligado. Saves continuam JSON (save binário vanilla não é usado).

Flags só do Harbour **não** implementadas aqui: `-videoc`, `-scaling`, `-gfxmode`, `-colors`, rede/CD/joystick.

---

## Estrutura

```
doom.ts              entrada: npx tsx doom.ts
run.bat              atalho Windows (npm install + IWAD padrão)
package.json         Node >=20, koffi, tsx
src/                 motor (TypeScript ESM)
lib/                 coloque SDL2.dll / libSDL2 aqui
screenshot/doom.png  screenshot do README
docs/                QR codes de doação
```

| Caminho | Vanilla / Harbour |
|---|---|
| `src/compat.ts` | `m_fixed`, `xhb_compat` |
| `src/defs.ts` | `doomdef`, `doomtype`, constantes `doomkeys` |
| `src/bin.ts` | leitores little-endian de WAD / mapa |
| `src/keys.ts` | `doomkeys` / keycodes SDL |
| `src/wad.ts` | `w_wad` |
| `src/video.ts` | `i_video`, `doomgeneric_allegro` (SDL2 + `-crt`) |
| `src/vvideo.ts` | `v_video` |
| `src/tables.ts` | `tables` |
| `src/rdata.ts` | `r_data` |
| `src/render.ts` | `r_main` `r_bsp` `r_segs` `r_plane` `r_draw` |
| `src/world.ts` | `p_setup` |
| `src/collision.ts` | `p_map` `p_maputl` `p_sight` (REJECT) |
| `src/player.ts` | `p_user` `p_pspr` |
| `src/specials.ts` | `p_spec` `p_doors` `p_plats` `p_floor` `p_switch` `p_telept` |
| `src/mobj.ts` | `info` `p_inter` |
| `src/sprites.ts` | `r_things` |
| `src/enemy.ts` | `p_enemy` (look / chase / ataque) |
| `src/status.ts` | `st_stuff` |
| `src/ammap.ts` | `am_map` |
| `src/sound.ts` | `i_sound`, CacheSFX, música MCI no Windows |
| `src/mus2mid.ts` | `mus2mid.c` |
| `src/menu.ts` | `m_menu` |
| `src/saveg.ts` | `p_saveg` (nome de 24 bytes + JSON) |
| `src/config.ts` | `m_misc` default.cfg |
| `src/wistuff.ts` | `wi_stuff` |
| `src/wipe.ts` | `f_wipe` melt |
| `src/finale.ts` | `f_finale` (texto + bunny scroll + cast MAP30) |
| `src/game.ts` | `d_main` `g_game` `d_loop` `boot` |

---

## Linhagem

1. **id Software DOOM** (1993) — motor original
2. **Chocolate Doom / doomgeneric** — C portátil
3. **[harbour_doom](https://github.com/vagucs/harbour_doom)** — Harbour + Allegro 4.2.2 (`Doom_hb.exe`)
4. **[python_doom](https://github.com/vagucs/python_doom)** — Python + pygame
5. **[php_doom](https://github.com/vagucs/php_doom)** — PHP 8 CLI + SDL2 FFI
6. **[node_doom](https://github.com/vagucs/node_doom)** — Node.js CLI + TypeScript + SDL2 (koffi) (esta árvore)
7. **[java_doom](https://github.com/vagucs/java_doom)** — Java 17 CLI + SDL2 (JNA)

---

## Doe

### Patrocínio no GitHub

[github.com/sponsors/vagucs](https://github.com/sponsors/vagucs)

### Ethereum

`0x1b64038A2b1DB73ABd0068d8B9B0d1dC5a90C5F1`

![QR Code Ethereum](docs/qr-ethereum.png)

### PIX

Chave: `vagucs@bol.com.br`

![QR Code PIX](docs/qr-pix.png)

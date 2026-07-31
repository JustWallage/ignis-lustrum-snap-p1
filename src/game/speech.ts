// Two decisions the pixel font forces. WHAT A CHARACTER BECOMES: `drawText` renders
// anything it has no glyph for as a blank, so accents are stripped and the rest becomes
// one `?` per user-perceived character (a pasted emoji is one mark). WHERE IT BREAKS: at
// most three lines, hard-splitting an over-long word, ellipsis when it overruns.

import { hasGlyph } from "@/game/font";

export const SPEECH_MS = 4_000;

export const SPEECH_LINE_MAX = 14;

export const SPEECH_LINES_MAX = 3;

const ELLIPSIS = "...";

const UNKNOWN = "?";

export interface Speech {
  lines: readonly string[];
  until: number;
}

/** Whole user-perceived characters, so a pasted emoji is not a row of `?` marks. */
const GRAPHEMES = new Intl.Segmenter();

function glyphFor(grapheme: string): string {
  if (/^\s+$/u.test(grapheme)) return " ";
  return hasGlyph(grapheme) ? grapheme : UNKNOWN;
}

export function sayable(text: string): string {
  const folded = text.normalize("NFD").replace(/\p{M}/gu, "").toUpperCase();
  return [...GRAPHEMES.segment(folded)]
    .map((piece) => glyphFor(piece.segment))
    .join("")
    .replace(/ +/g, " ")
    .trim();
}

function pieces(word: string): string[] {
  if (word.length <= SPEECH_LINE_MAX) return [word];
  const split: string[] = [];
  for (let at = 0; at < word.length; at += SPEECH_LINE_MAX) {
    split.push(word.slice(at, at + SPEECH_LINE_MAX));
  }
  return split;
}

export function speechLines(text: string): readonly string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of sayable(text).split(" ")) {
    if (word === "") continue;
    for (const piece of pieces(word)) {
      if (line === "") line = piece;
      else if (line.length + 1 + piece.length <= SPEECH_LINE_MAX) {
        line = `${line} ${piece}`;
      } else {
        lines.push(line);
        line = piece;
      }
    }
  }
  if (line !== "") lines.push(line);
  if (lines.length <= SPEECH_LINES_MAX) return lines;

  const kept = lines.slice(0, SPEECH_LINES_MAX);
  const last = kept[SPEECH_LINES_MAX - 1] ?? "";
  kept[SPEECH_LINES_MAX - 1] =
    last.slice(0, SPEECH_LINE_MAX - ELLIPSIS.length) + ELLIPSIS;
  return kept;
}

export function speechOf(text: string, now: number): Speech {
  return { lines: speechLines(text), until: now + SPEECH_MS };
}

export function speechFor(
  speech: Speech | null,
  now: number,
): readonly string[] | null {
  if (speech === null || now >= speech.until) return null;
  return speech.lines.length === 0 ? null : speech.lines;
}

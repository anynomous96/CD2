/* ITU-R M.1677-1 international morse code table + encode/decode engines */

export const MORSE_MAP: Record<string, string> = {
  A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.',
  H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.',
  O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-',
  V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..',
  '0': '-----', '1': '.----', '2': '..---', '3': '...--', '4': '....-',
  '5': '.....', '6': '-....', '7': '--...', '8': '---..', '9': '----.',
  '.': '.-.-.-', ',': '--..--', '?': '..--..', "'": '.----.', '!': '-.-.--',
  '/': '-..-.', '(': '-.--.', ')': '-.--.-', '&': '.-...', ':': '---...',
  ';': '-.-.-.', '=': '-...-', '+': '.-.-.', '-': '-....-', '_': '..--.-',
  '"': '.-..-.', '$': '...-..-', '@': '.--.-.',
};

export const REVERSE_MAP: Record<string, string> = (() => {
  const r: Record<string, string> = {};
  for (const [char, code] of Object.entries(MORSE_MAP)) r[code] = char;
  return r;
})();

export interface LetterUnit {
  char: string;
  morse: string;
}

/** words → letters, doubles as the playback timeline source */
export type MorseWords = LetterUnit[][];

export interface EncodeResult {
  morse: string;
  words: MorseWords;
  invalid: string[];
}

export interface DecodeResult {
  text: string;
  words: MorseWords;
  invalidChars: string[];
  unknownSeqs: string[];
}

/** text -> morse. Words separated by any whitespace become " / " groups and can never merge. */
export function encodeText(raw: string): EncodeResult {
  const invalid: string[] = [];
  const words: MorseWords = [];
  const rawWords = raw.trim().split(/\s+/);
  for (const rw of rawWords) {
    if (!rw) continue;
    const units: LetterUnit[] = [];
    for (const ch of rw) {
      const up = ch.toUpperCase();
      const code = MORSE_MAP[up];
      if (code) units.push({ char: up, morse: code });
      else if (/\s/.test(ch)) continue;
      else if (!invalid.includes(ch)) invalid.push(ch);
    }
    if (units.length) words.push(units);
  }
  const morse = words.map(w => w.map(u => u.morse).join(' ')).join(' / ');
  return { morse, words, invalid };
}

const normalizeRun = (run: string) =>
  run
    .replace(/[\u2013\u2014\u2212_]/g, '-') // – — − _
    .replace(/[\u2022\u00B7*]/g, '.');      // • · *

/**
 * morse -> text.
 * Tokenizer rules: single space separates letters; 2+ spaces, newlines or "/"
 * separate words. Unknown sequences and stray characters are reported, never
 * rendered as placeholder glyphs.
 */
export function decodeMorse(raw: string): DecodeResult {
  const invalidChars: string[] = [];
  const unknownSeqs: string[] = [];
  const words: MorseWords = [];
  let current: LetterUnit[] = [];
  const flushWord = () => {
    if (current.length) {
      words.push(current);
      current = [];
    }
  };
  const re = /([.\-_*•·–—−]+)|(\s+)|(\/)|(.)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const [, run, ws, slash, other] = m;
    if (run !== undefined) {
      const norm = normalizeRun(run);
      const letter = REVERSE_MAP[norm];
      if (letter) current.push({ char: letter, morse: norm });
      else if (!unknownSeqs.includes(run)) unknownSeqs.push(run);
    } else if (ws !== undefined) {
      if (ws.length >= 2 || /[\n\r]/.test(ws)) flushWord();
    } else if (slash !== undefined) {
      flushWord();
    } else if (other && !/\s/.test(other)) {
      if (!invalidChars.includes(other)) invalidChars.push(other);
    }
  }
  flushWord();
  const text = words.map(w => w.map(u => u.char).join('')).join(' ');
  return { text, words, invalidChars, unknownSeqs };
}

export const SHEET_LETTERS: [string, string][] = Object.entries(MORSE_MAP).filter(
  ([c]) => /^[A-Z0-9]$/.test(c),
);
export const SHEET_PUNCT: [string, string][] = Object.entries(MORSE_MAP).filter(
  ([c]) => !/^[A-Z0-9]$/.test(c),
);

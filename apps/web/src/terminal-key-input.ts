export type TerminalModifierState = Readonly<{
  ctrl: boolean;
  alt: boolean;
}>;

export type TerminalKey =
  | "escape"
  | "tab"
  | "backTab"
  | "enter"
  | "arrowUp"
  | "arrowDown"
  | "arrowLeft"
  | "arrowRight"
  | "home"
  | "end"
  | "pageUp"
  | "pageDown"
  | "backspace"
  | "delete";

const ESC = "\u001b";
const NO_MODIFIERS: TerminalModifierState = { ctrl: false, alt: false };

const BASE_KEY_SEQUENCES: Record<TerminalKey, string> = {
  escape: ESC,
  tab: "\t",
  backTab: `${ESC}[Z`,
  enter: "\r",
  arrowUp: `${ESC}[A`,
  arrowDown: `${ESC}[B`,
  arrowLeft: `${ESC}[D`,
  arrowRight: `${ESC}[C`,
  home: `${ESC}[H`,
  end: `${ESC}[F`,
  pageUp: `${ESC}[5~`,
  pageDown: `${ESC}[6~`,
  backspace: "\u007f",
  delete: `${ESC}[3~`
};

const KEY_BY_SEQUENCE = new Map(
  Object.entries(BASE_KEY_SEQUENCES).map(([key, sequence]) => [
    sequence,
    key as TerminalKey
  ])
);

export function controlCharacter(value: string): string | undefined {
  if (value.length !== 1) return undefined;
  const code = value.toUpperCase().charCodeAt(0);
  if (code >= 64 && code <= 95) return String.fromCharCode(code - 64);
  return undefined;
}

export function encodeControlShortcut(value: string): string {
  const sequence = controlCharacter(value);
  if (!sequence) {
    throw new Error(`Unsupported Ctrl shortcut: ${value}`);
  }
  return sequence;
}

function modifierParameter(modifiers: TerminalModifierState): number {
  return 1 + (modifiers.alt ? 2 : 0) + (modifiers.ctrl ? 4 : 0);
}

function modifiedNavigationSequence(
  key: TerminalKey,
  modifiers: TerminalModifierState
): string | undefined {
  const parameter = modifierParameter(modifiers);
  if (parameter === 1) return undefined;

  switch (key) {
    case "arrowUp":
      return `${ESC}[1;${parameter}A`;
    case "arrowDown":
      return `${ESC}[1;${parameter}B`;
    case "arrowRight":
      return `${ESC}[1;${parameter}C`;
    case "arrowLeft":
      return `${ESC}[1;${parameter}D`;
    case "home":
      return `${ESC}[1;${parameter}H`;
    case "end":
      return `${ESC}[1;${parameter}F`;
    case "pageUp":
      return `${ESC}[5;${parameter}~`;
    case "pageDown":
      return `${ESC}[6;${parameter}~`;
    case "delete":
      return `${ESC}[3;${parameter}~`;
    default:
      return undefined;
  }
}

export function encodeTerminalKey(
  key: TerminalKey,
  modifiers: TerminalModifierState = NO_MODIFIERS
): string {
  const modifiedNavigation = modifiedNavigationSequence(key, modifiers);
  if (modifiedNavigation) return modifiedNavigation;

  const base = BASE_KEY_SEQUENCES[key];
  return modifiers.alt ? ESC + base : base;
}

export function applyTerminalModifiers(
  raw: string,
  modifiers: TerminalModifierState
): string {
  if (!modifiers.ctrl && !modifiers.alt) return raw;

  const knownKey = KEY_BY_SEQUENCE.get(raw);
  if (knownKey) return encodeTerminalKey(knownKey, modifiers);

  const controlled = modifiers.ctrl ? controlCharacter(raw) : undefined;
  const data = controlled ?? raw;
  return modifiers.alt ? ESC + data : data;
}

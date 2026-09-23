const ESC = "\u001b";
const DEL = "\u007f";

export class Ime229InputTransaction {
  private baseline: string | undefined;
  private bufferedData = "";

  get active(): boolean {
    return this.baseline !== undefined;
  }

  begin(textareaValue: string): void {
    if (this.baseline !== undefined) return;
    this.baseline = textareaValue;
    this.bufferedData = "";
  }

  captureTerminalData(data: string): string | undefined {
    if (this.baseline === undefined) return data;
    this.bufferedData += data;
    return undefined;
  }

  cancel(): void {
    this.baseline = undefined;
    this.bufferedData = "";
  }

  finalize(textareaValue: string): string | undefined {
    const baseline = this.baseline;
    if (baseline === undefined) return undefined;

    const buffered = this.bufferedData;
    this.cancel();

    const delta = textareaInputDelta(baseline, textareaValue);
    return delta || buffered || undefined;
  }
}

export function textareaInputDelta(
  previousValue: string,
  nextValue: string
): string {
  if (previousValue === nextValue) return "";

  const previous = Array.from(previousValue);
  const next = Array.from(nextValue);
  let commonPrefix = 0;
  while (
    commonPrefix < previous.length &&
    commonPrefix < next.length &&
    previous[commonPrefix] === next[commonPrefix]
  ) {
    commonPrefix += 1;
  }

  const removed = previous.length - commonPrefix;
  const inserted = next.slice(commonPrefix).join("");
  return DEL.repeat(removed) + inserted;
}

type ImeKeyboardEvent = Pick<
  KeyboardEvent,
  "type" | "keyCode" | "code" | "ctrlKey" | "altKey" | "metaKey" | "isComposing"
>;

export function recoverIme229ControlKey(
  event: ImeKeyboardEvent
): string | undefined {
  if (
    event.type !== "keydown" ||
    event.keyCode !== 229 ||
    event.isComposing
  ) return undefined;

  if (
    !event.ctrlKey &&
    !event.altKey &&
    !event.metaKey &&
    event.code === "Escape"
  ) {
    return ESC;
  }

  if (!event.ctrlKey || event.altKey || event.metaKey) return undefined;
  if (event.code === "Space") return "\u0000";

  const letter = /^Key([A-Z])$/.exec(event.code)?.[1];
  if (!letter) return undefined;
  return String.fromCharCode(letter.charCodeAt(0) - 64);
}

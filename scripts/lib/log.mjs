/**
 * Console output for the scripts in this folder.
 *
 * No dependency: a few ANSI escapes and a handful of helpers. Every script
 * here is meant to be run by one person on his own laptop, so the output is
 * written for a human reading it at 11pm — short lines, an obvious verb at the
 * start, and colour used to separate kinds of message rather than to decorate.
 *
 * Colour is disabled when NO_COLOR is set (https://no-color.org), when
 * FORCE_COLOR=0, or when stdout is not a TTY (piping to a file or CI log).
 */

const forceColor = process.env.FORCE_COLOR;

const COLOR_ENABLED =
  forceColor !== undefined && forceColor !== '0'
    ? true
    : process.env.NO_COLOR === undefined &&
      forceColor !== '0' &&
      process.env.TERM !== 'dumb' &&
      Boolean(process.stdout.isTTY);

function wrap(open, close) {
  return (text) =>
    COLOR_ENABLED ? `\u001b[${open}m${text}\u001b[${close}m` : String(text);
}

export const colors = {
  reset: wrap(0, 0),
  bold: wrap(1, 22),
  dim: wrap(2, 22),
  italic: wrap(3, 23),
  underline: wrap(4, 24),
  red: wrap(31, 39),
  green: wrap(32, 39),
  yellow: wrap(33, 39),
  blue: wrap(34, 39),
  magenta: wrap(35, 39),
  cyan: wrap(36, 39),
  grey: wrap(90, 39),
  white: wrap(97, 39),
};

export const isColorEnabled = COLOR_ENABLED;

/* ==========================================================================
   Messages
   ========================================================================== */

/** Plain line. */
export function log(...parts) {
  console.log(parts.join(' '));
}

export function blank() {
  console.log('');
}

/** A section heading — used once or twice per run, not per file. */
export function heading(text) {
  console.log('');
  console.log(colors.bold(colors.white(text)));
  console.log(colors.grey('─'.repeat(Math.min(72, Math.max(8, text.length)))));
}

/** Neutral progress. */
export function info(text) {
  console.log(`${colors.blue('·')} ${text}`);
}

/** Something finished and it went well. */
export function success(text) {
  console.log(`${colors.green('✓')} ${text}`);
}

/** Something is off but the run continues. Goes to stderr so pipes stay clean. */
export function warn(text) {
  console.warn(`${colors.yellow('!')} ${text}`);
}

/** Something failed. The run may still continue — check the summary. */
export function error(text) {
  console.error(`${colors.red('✗')} ${text}`);
}

/** Quiet detail under a previous line. */
export function detail(text) {
  console.log(`  ${colors.grey(text)}`);
}

/** A numbered/bulleted item in a list of instructions. */
export function bullet(text) {
  console.log(`  ${colors.grey('—')} ${text}`);
}

/** A step in a multi-stage run: "[3/48] IMG_0042.jpg". */
export function step(index, total, text) {
  const width = String(total).length;
  const counter = `[${String(index).padStart(width, ' ')}/${total}]`;
  console.log(`${colors.grey(counter)} ${text}`);
}

/** Usage text. Printed verbatim, never colourised — it gets copy-pasted. */
export function usage(text) {
  console.log(text.trimEnd());
}

/**
 * Print an error and exit. Reserved for the cases where continuing would
 * either do damage or produce nonsense.
 */
export function fail(text, code = 1) {
  error(text);
  process.exit(code);
}

/* ==========================================================================
   Formatting
   ========================================================================== */

/** `4.2 MB`. Base 10, because that is what file managers show. */
export function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1000) return `${value} B`;
  const units = ['kB', 'MB', 'GB', 'TB'];
  let n = value / 1000;
  let unit = 0;
  while (n >= 1000 && unit < units.length - 1) {
    n /= 1000;
    unit += 1;
  }
  return `${n < 10 ? n.toFixed(1) : Math.round(n)} ${units[unit]}`;
}

/** `1m 12s` / `4.1s` / `320ms`. */
export function formatDuration(ms) {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

export function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** Left-pads a count so a summary column lines up. */
export function pad(value, width) {
  return String(value).padStart(width, ' ');
}

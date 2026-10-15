/* Build-time constants for the printer palette, for consumers that cannot
   read CSS (manifest generation, satori OG images). The canonical source is
   printer-palette.css in this directory — update it in the same change. */

/** Workbench/desk background, matches --printer-desk (light). */
export const PRINTER_DESK = "#d9dad6";

/** Accent orange, matches --color-printer-accent (light). */
export const PRINTER_ACCENT = "#ff6b35";

/** Ink, matches --color-printer-ink (light). */
export const PRINTER_INK = "#292824";

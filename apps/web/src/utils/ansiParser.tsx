import React from 'react';

export interface AnsiSegment {
  text: string;
  color?: string;
  bold?: boolean;
  underline?: boolean;
}

const ANSI_COLOR_MAP: Record<number, string> = {
  30: '#4B5563', // black / dark gray
  31: '#EF4444', // red
  32: '#22C55E', // green
  33: '#EAB308', // yellow
  34: '#3B82F6', // blue
  35: '#A855F7', // magenta / purple
  36: '#06B6D4', // cyan
  37: '#F3F4F6', // white
  90: '#9CA3AF', // bright black / gray
  91: '#F87171', // bright red
  92: '#4ADE80', // bright green
  93: '#FDE047', // bright yellow
  94: '#60A5FA', // bright blue
  95: '#C084FC', // bright magenta
  96: '#22D3EE', // bright cyan
  97: '#FFFFFF', // bright white
};

/**
 * Parses a string containing ANSI escape codes into structured text segments.
 */
export function parseAnsi(input: string): AnsiSegment[] {
  if (!input) return [];
  if (!input.includes('\u001b') && !input.includes('\x1b')) {
    return [{ text: input }];
  }

  // Strip control cursor / clear-line escape codes
  const cleaned = input.replace(/\x1b\[[0-9;]*[A-HJKSTf]/g, '');

  const regex = /\x1b\[([0-9;]*)m/g;
  const segments: AnsiSegment[] = [];

  let lastIndex = 0;
  let currentColor: string | undefined = undefined;
  let isBold = false;
  let isUnderline = false;

  let match: RegExpExecArray | null;

  while ((match = regex.exec(cleaned)) !== null) {
    const textBefore = cleaned.slice(lastIndex, match.index);
    if (textBefore) {
      segments.push({
        text: textBefore,
        color: currentColor,
        bold: isBold,
        underline: isUnderline,
      });
    }

    const codes = match[1] ? match[1].split(';').map(c => parseInt(c, 10)) : [0];
    for (const code of codes) {
      if (code === 0) {
        currentColor = undefined;
        isBold = false;
        isUnderline = false;
      } else if (code === 1) {
        isBold = true;
      } else if (code === 4) {
        isUnderline = true;
      } else if (code === 22) {
        isBold = false;
      } else if (code === 24) {
        isUnderline = false;
      } else if (code === 39) {
        currentColor = undefined;
      } else if (ANSI_COLOR_MAP[code]) {
        currentColor = ANSI_COLOR_MAP[code];
      }
    }

    lastIndex = regex.lastIndex;
  }

  const remaining = cleaned.slice(lastIndex);
  if (remaining) {
    segments.push({
      text: remaining,
      color: currentColor,
      bold: isBold,
      underline: isUnderline,
    });
  }

  return segments;
}

/**
 * Renders an ANSI-formatted line as React elements with inline styles.
 */
export function renderAnsiLine(line: string): React.ReactNode {
  const segments = parseAnsi(line);
  if (segments.length === 1 && !segments[0].color && !segments[0].bold && !segments[0].underline) {
    return segments[0].text;
  }

  return (
    <>
      {segments.map((seg, idx) => (
        <span
          key={idx}
          style={{
            color: seg.color,
            fontWeight: seg.bold ? 700 : undefined,
            textDecoration: seg.underline ? 'underline' : undefined,
          }}
        >
          {seg.text}
        </span>
      ))}
    </>
  );
}

// A QR code as a picture in the page, drawn from text. The code is worked out
// here, on the device, by a small library that ships with the app; nothing is
// asked of any other host.

import qrcode from 'qrcode-generator';

const SVG = 'http://www.w3.org/2000/svg';
/** The clear band a scanner needs around a code, in squares. */
const QUIET = 4;

/**
 * The code for `text`, or null when the text is too long to fit in one. It is
 * always dark on white, whatever the theme: scanners expect that.
 */
export function qrPicture(text: string, label: string): SVGSVGElement | null {
  let code;
  try {
    // 0 lets the library pick the smallest code that holds the text; 'M' can
    // lose about a seventh of its squares to glare or dirt and still be read.
    code = qrcode(0, 'M');
    code.addData(text);
    code.make();
  } catch {
    return null;
  }
  const count = code.getModuleCount();
  const side = count + QUIET * 2;
  // One path of unit squares, so the picture is a single element.
  let path = '';
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (code.isDark(row, col)) path += `M${col + QUIET} ${row + QUIET}h1v1h-1z`;
    }
  }
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', `0 0 ${side} ${side}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label);
  svg.setAttribute('shape-rendering', 'crispEdges');
  const paper = document.createElementNS(SVG, 'rect');
  paper.setAttribute('width', String(side));
  paper.setAttribute('height', String(side));
  paper.setAttribute('fill', '#ffffff');
  const ink = document.createElementNS(SVG, 'path');
  ink.setAttribute('d', path);
  ink.setAttribute('fill', '#000000');
  svg.append(paper, ink);
  return svg;
}

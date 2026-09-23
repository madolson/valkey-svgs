import { C, mark, n } from '../lib/core.mjs';

// One grant: the command chip and the key pattern it covers, both the same height
// so the pair reads as one rule rather than as two objects.
function aclGrant(x, y, chipW, barW, h, { chip = C.mint, opacity = 1 } = {}) {
  const rx = n(h / 2);
  return (
    `<rect x="${n(x)}" y="${n(y - h / 2)}" width="${n(chipW)}" height="${n(h)}" rx="${rx}" fill="${chip}" ` +
      `opacity="${n(opacity)}"/>` +
    `<rect x="${n(x + chipW + h * 0.6)}" y="${n(y - h / 2)}" width="${n(barW)}" height="${n(h)}" rx="${rx}" ` +
      `fill="${C.ice}" opacity="${n(opacity * 0.62)}"/>`
  );
}

// The definition's header: the mark, and a bar standing in for the role's name,
// because the thing being pointed at is one *named* definition. No text: it would
// need translating and it goes illegible in the narrow crop.
function aclHeader(x, y, markH, nameW) {
  return (
    `<g opacity="0.95">${mark(x, y, markH)}</g>` +
    `<rect x="${n(x + 40)}" y="${n(y - 11)}" width="${n(nameW)}" height="22" rx="11" fill="${C.ice}" opacity="0.6"/>`
  );
}

// One grant: the command chip and the key pattern it covers, both the same height
// so the pair reads as one rule rather than as two objects.

// A holder: head and shoulders, one stroke weight, no fill. `s` scales it whole.
function aclHolder(cx, cy, s = 1, opacity = 0.55) {
  const halfW = 46 * s;
  const baseY = cy + 44 * s;
  return (
    `<g fill="none" stroke="${C.cyanLt}" stroke-width="${n(6 * s)}" stroke-linecap="round" opacity="${n(opacity)}">` +
    `<circle cx="${n(cx)}" cy="${n(cy - 30 * s)}" r="${n(21 * s)}"/>` +
    `<path d="M ${n(cx - halfW)} ${n(baseY)} A ${n(halfW)} ${n(halfW * 0.95)} 0 0 1 ${n(cx + halfW)} ${n(baseY)}"/>` +
    `</g>`
  );
}

// The definition's header: the mark, and a bar standing in for the role's name,
// because the thing being pointed at is one *named* definition. No text: it would
// need translating and it goes illegible in the narrow crop.

function aclRolesB(r) {
  // Idea: one permission set, held by many users, edited in one place.
  // Focal: the role definition panel on the left, the only haloed object; the
  // grant it is edited in is the one row the fan leaves from.
  const px = 520;
  const pw = 330;
  const pTop = 230;
  const pH = 620;
  const rows = [300, 420, 540, 660, 780];
  const gx = 1060; // where each holder's copy of the granted rule starts
  const hx = 1350;
  const EDIT = 3; // the row that is being edited, and so the source of the fan

  const spec = [];
  let editY = 0;
  for (let i = 0; i < 8; i++) {
    const y = 366 + i * 62;
    if (i === EDIT) {
      editY = y;
      spec.push(aclGrant(px + 42, y, 76, 118, 28, { opacity: 0.95 }));
    } else {
      spec.push(
        aclGrant(px + 42, y, 76, 70 + r() * 60, 28, { chip: C.ice, opacity: n(0.5 + r() * 0.16) })
      );
    }
  }

  const fan = rows
    .map((y) => `<path d="M ${n(px + pw)} ${n(editY)} C ${n(px + pw + 90)} ${n(editY)} ${gx - 90} ${n(y)} ${gx} ${n(y)}"/>`)
    .join('');

  const copies = rows.map((y) => aclGrant(gx, y, 88, 110, 30, { opacity: 0.6 })).join('');
  const holders = rows.map((y) => aclHolder(hx, y, 1, 0.55)).join('');
  const outline = `<rect x="${px}" y="${pTop}" width="${pw}" height="${pH}" rx="24"`;

  return [
    `  <ellipse cx="${n(px + pw / 2)}" cy="540" rx="280" ry="420" fill="url(#h-gold)" opacity="0.26"/>`,
    `  ${outline} fill="none" stroke="${C.gold}" stroke-width="26" opacity="0.22" filter="url(#blur18)"/>`,
    `  <g fill="none" stroke="${C.mint}" stroke-width="3" opacity="0.55">${fan}</g>`,
    `  ${outline} fill="${C.ink}" fill-opacity="0.55" stroke="${C.gold}" stroke-width="6" opacity="0.95"/>`,
    `  <g>${aclHeader(px + 60, pTop + 56, 46, 142)}</g>`,
    `  <line x1="${n(px + 36)}" y1="${n(pTop + 104)}" x2="${n(px + pw - 36)}" y2="${n(pTop + 104)}" ` +
      `stroke="${C.ice}" stroke-width="2.4" opacity="0.5"/>`,
    `  <g>${spec.join('')}</g>`,
    `  <g>${copies}</g>`,
    `  <g>${holders}</g>`,
  ].join('\n');
}

export const themes = [
    { name: 'acl-roles', order: 39, seed: 91041, zoom: 1.34, center: [960, 540], title: 'Valkey ACL roles', desc: 'A gold-outlined role definition panel on the left with one of its permission grants picked out in green, green lines fanning out of that one grant to five identical accounts on the right that each carry the same green grant, representing a permission set edited in one place and reaching every user holding it.', art: aclRolesB, motif: "One definition fanning out to identical holders", use: "Roles, shared permission sets, many users one grant" },
];

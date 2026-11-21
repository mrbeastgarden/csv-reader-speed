// csv-reader-speed — a faster drop-in for csv-reader 1.0.0 (make.fun's own
// CSV reader). Returns exactly csv-reader's answer, {columns, rows, errors},
// for every {text, header}, by the same broken-row policy its reference
// program (vendor/csv-reader/index.js in the kit) spells out:
//
//   - a U+FEFF at the very start of the text is dropped;
//   - a record ends at LF or CRLF, and a line left with no characters is no
//     record;
//   - outside a quoted field a CR not followed by LF is dropped (stray_cr);
//   - a field that opens with a quote runs to the next quote that is not
//     doubled, "" inside it one quote, and each CRLF or lone CR inside it is
//     read as LF; what follows its closing quote, up to the next comma or
//     line break, is appended as it stands (quote_junk, when the field
//     ends); a quote that never closes is a literal character, and the text
//     after it is read again as unquoted (unterminated_quote);
//   - a quote inside an unquoted field is a literal character; fields stay
//     strings, never trimmed or converted;
//   - columns is the first record when header is true, else null; rows holds
//     the records after it, each padded with "" (short_row, with fields: its
//     count) or cut (long_row, with extra: the cut fields) to the first
//     record's width;
//   - each error is {code, line, row}: line the 1-based line its record
//     starts on, row its record's index in rows (null for the header).
//
// Speed comes from never reading one character at a time: unquoted fields
// jump with indexOf to the next comma, LF or CR and take the field as one
// slice; quoted fields jump with indexOf to the next quote and take each
// segment as one slice, converting CR/CRLF to LF only in the rare segment
// that holds one. Pure: no clock, no randomness, no locale, nothing kept
// from one call to the next.

/** How a field ended: at a comma, at a line break, or at the end of the text. */
const COMMA = 1;
const BREAK = 2;
const END = 0;

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;
  const n = text.length;

  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows it
  // takes (null: the header).
  let recordLine = 1;
  let recordRow = null;

  function fail(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // A piece of a quoted field: CRLF and a lone CR are each read as one LF,
  // and each counts one line. The common piece (no CR or LF at all) comes
  // back untouched, with no line counted.
  function fold(seg) {
    const cr = seg.indexOf('\r');
    const nl = seg.indexOf('\n');
    if (cr === -1 && nl === -1) return seg;
    const breaks = seg.match(/\r\n?|\n/g);
    if (breaks) line += breaks.length;
    return cr === -1 ? seg : seg.replace(/\r\n?/g, '\n');
  }

  // Reads unquoted characters onto `value` up to the next comma or line
  // break: a CR not followed by LF is dropped (stray_cr). Returns the field
  // and how it ended; `added` counts the characters kept.
  function readUnquoted(value) {
    let added = 0;
    for (;;) {
      const comma = text.indexOf(',', pos);
      const lf = text.indexOf('\n', pos);
      const cr = text.indexOf('\r', pos);
      let m = n;
      let kind = END;
      if (comma !== -1 && comma < m) { m = comma; kind = COMMA; }
      if (lf !== -1 && lf < m) { m = lf; kind = BREAK; }
      if (cr !== -1 && cr < m) { m = cr; kind = 3; }
      if (kind === END) {
        if (pos < n) { value += text.slice(pos, n); added += n - pos; }
        pos = n;
        return { value, ended: END, added };
      }
      if (kind === COMMA) {
        value += text.slice(pos, m);
        added += m - pos;
        pos = m + 1;
        return { value, ended: COMMA, added };
      }
      if (kind === BREAK) {
        value += text.slice(pos, m);
        added += m - pos;
        pos = m + 1;
        line += 1;
        return { value, ended: BREAK, added };
      }
      // A CR: CRLF ends the field at a line break, a lone CR is dropped.
      if (text.charCodeAt(m + 1) === 10) {
        value += text.slice(pos, m);
        added += m - pos;
        pos = m + 2;
        line += 1;
        return { value, ended: BREAK, added };
      }
      fail('stray_cr');
      value += text.slice(pos, m);
      added += m - pos;
      pos = m + 1;
    }
  }

  // Reads a quoted field whose opening quote is at pos.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let value = '';
    pos += 1;
    let closed = false;
    while (pos < n) {
      const q = text.indexOf('"', pos);
      if (q === -1) break;
      if (text.charCodeAt(q + 1) === 34) {
        // A doubled quote is one literal quote.
        value += fold(text.slice(pos, q));
        value += '"';
        pos = q + 2;
        continue;
      }
      value += fold(text.slice(pos, q));
      pos = q + 1;
      closed = true;
      break;
    }
    if (!closed) {
      // The quote never closes: it is a literal character, and the text
      // after it is read again as unquoted.
      pos = open + 1;
      line = openLine;
      fail('unterminated_quote');
      return readUnquoted('"');
    }
    if (pos >= n) return { value, ended: END };
    const c = text.charCodeAt(pos);
    if (c === 44) {
      pos += 1;
      return { value, ended: COMMA };
    }
    if (c === 10) {
      pos += 1;
      line += 1;
      return { value, ended: BREAK };
    }
    if (c === 13 && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      return { value, ended: BREAK };
    }
    // What follows the closing quote is appended as it stands, up to the
    // next comma or line break.
    const junk = readUnquoted(value);
    if (junk.added > 0) fail('quote_junk');
    return junk;
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let field;
    let quoted;
    do {
      quoted = text.charCodeAt(pos) === 34;
      field = quoted ? readQuoted() : readUnquoted('');
      fields.push(field.value);
    } while (field.ended === COMMA);

    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}

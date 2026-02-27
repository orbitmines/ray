// ============================================================
// Markdown.ts — Zero-dependency markdown parser → HTML string
// ============================================================

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---- Inline Parsing ----

function parseInline(text: string): string {
  let out = '';
  let i = 0;
  const len = text.length;

  while (i < len) {
    // Images: ![alt](url)
    if (text[i] === '!' && text[i + 1] === '[') {
      const altEnd = text.indexOf(']', i + 2);
      if (altEnd !== -1 && text[altEnd + 1] === '(') {
        const urlEnd = text.indexOf(')', altEnd + 2);
        if (urlEnd !== -1) {
          const alt = escapeHtml(text.slice(i + 2, altEnd));
          const url = escapeHtml(text.slice(altEnd + 2, urlEnd));
          out += `<img src="${url}" alt="${alt}">`;
          i = urlEnd + 1;
          continue;
        }
      }
    }

    // Links: [text](url)
    if (text[i] === '[') {
      const textEnd = text.indexOf(']', i + 1);
      if (textEnd !== -1 && text[textEnd + 1] === '(') {
        const urlEnd = text.indexOf(')', textEnd + 2);
        if (urlEnd !== -1) {
          const linkText = parseInline(text.slice(i + 1, textEnd));
          const url = escapeHtml(text.slice(textEnd + 2, urlEnd));
          out += `<a href="${url}">${linkText}</a>`;
          i = urlEnd + 1;
          continue;
        }
      }
    }

    // Code spans: `code`
    if (text[i] === '`') {
      const end = text.indexOf('`', i + 1);
      if (end !== -1) {
        out += `<code>${escapeHtml(text.slice(i + 1, end))}</code>`;
        i = end + 1;
        continue;
      }
    }

    // Bold + italic: ***text*** or ___text___
    if ((text[i] === '*' || text[i] === '_') && text[i + 1] === text[i] && text[i + 2] === text[i]) {
      const ch = text[i];
      const close = text.indexOf(ch + ch + ch, i + 3);
      if (close !== -1) {
        out += `<strong><em>${parseInline(text.slice(i + 3, close))}</em></strong>`;
        i = close + 3;
        continue;
      }
    }

    // Bold: **text** or __text__
    if ((text[i] === '*' || text[i] === '_') && text[i + 1] === text[i]) {
      const ch = text[i];
      const close = text.indexOf(ch + ch, i + 2);
      if (close !== -1) {
        out += `<strong>${parseInline(text.slice(i + 2, close))}</strong>`;
        i = close + 2;
        continue;
      }
    }

    // Strikethrough: ~~text~~
    if (text[i] === '~' && text[i + 1] === '~') {
      const close = text.indexOf('~~', i + 2);
      if (close !== -1) {
        out += `<del>${parseInline(text.slice(i + 2, close))}</del>`;
        i = close + 2;
        continue;
      }
    }

    // Italic: *text* or _text_
    if (text[i] === '*' || text[i] === '_') {
      const ch = text[i];
      const close = text.indexOf(ch, i + 1);
      if (close !== -1 && close > i + 1) {
        out += `<em>${parseInline(text.slice(i + 1, close))}</em>`;
        i = close + 1;
        continue;
      }
    }

    out += escapeHtml(text[i]);
    i++;
  }

  return out;
}

// ---- Block Parsing ----

export function renderMarkdown(source: string): string {
  const lines = source.split('\n');
  const html: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code blocks
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      const langAttr = lang ? ` class="language-${escapeHtml(lang)}"` : '';
      html.push(`<pre><code${langAttr}>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      html.push(`<h${level}>${parseInline(headingMatch[2])}</h${level}>`);
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(\*{3,}|-{3,}|_{3,})\s*$/.test(line)) {
      html.push('<hr>');
      i++;
      continue;
    }

    // Table
    if (line.includes('|') && i + 1 < lines.length && /^\|?\s*[-:]+[-| :]*$/.test(lines[i + 1])) {
      const parseRow = (row: string): string[] =>
        row.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());

      const headers = parseRow(line);
      const alignLine = parseRow(lines[i + 1]);
      const aligns: string[] = alignLine.map(a => {
        if (a.startsWith(':') && a.endsWith(':')) return 'center';
        if (a.endsWith(':')) return 'right';
        return 'left';
      });

      let table = '<table><thead><tr>';
      headers.forEach((h, idx) => {
        table += `<th style="text-align:${aligns[idx] || 'left'}">${parseInline(h)}</th>`;
      });
      table += '</tr></thead><tbody>';

      i += 2;
      while (i < lines.length && lines[i].includes('|')) {
        const cells = parseRow(lines[i]);
        table += '<tr>';
        cells.forEach((c, idx) => {
          table += `<td style="text-align:${aligns[idx] || 'left'}">${parseInline(c)}</td>`;
        });
        table += '</tr>';
        i++;
      }
      table += '</tbody></table>';
      html.push(table);
      continue;
    }

    // Blockquote
    if (line.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('>')) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      html.push(`<blockquote>${renderMarkdown(quoteLines.join('\n'))}</blockquote>`);
      continue;
    }

    // Unordered list / task list
    if (/^[\s]*[-*+]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[\s]*[-*+]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[\s]*[-*+]\s/, ''));
        i++;
      }
      const listItems = items.map(item => {
        // Task list
        if (item.startsWith('[x] ') || item.startsWith('[X] ')) {
          return `<li class="task-item"><input type="checkbox" checked disabled> ${parseInline(item.slice(4))}</li>`;
        }
        if (item.startsWith('[ ] ')) {
          return `<li class="task-item"><input type="checkbox" disabled> ${parseInline(item.slice(4))}</li>`;
        }
        return `<li>${parseInline(item)}</li>`;
      });
      html.push(`<ul>${listItems.join('')}</ul>`);
      continue;
    }

    // Ordered list
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, ''));
        i++;
      }
      html.push(`<ol>${items.map(item => `<li>${parseInline(item)}</li>`).join('')}</ol>`);
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Paragraph
    const paraLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== '' && !lines[i].startsWith('#') && !lines[i].startsWith('```') && !lines[i].startsWith('>') && !/^[-*+]\s/.test(lines[i]) && !/^\d+\.\s/.test(lines[i]) && !/^(\*{3,}|-{3,}|_{3,})\s*$/.test(lines[i])) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      html.push(`<p>${parseInline(paraLines.join(' '))}</p>`);
    }
  }

  return html.join('\n');
}

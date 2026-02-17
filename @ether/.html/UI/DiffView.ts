// ============================================================
// DiffView.ts — LCS-based line diff algorithm + HTML rendering
// ============================================================

export interface DiffLine {
  type: 'add' | 'remove' | 'context';
  oldNum: number | null;
  newNum: number | null;
  text: string;
}

/** Compute LCS table for two arrays of lines */
function lcsTable(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  return dp;
}

/** Compute line-level diff using LCS backtracking */
export function computeDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const dp = lcsTable(oldLines, newLines);

  const result: DiffLine[] = [];
  let i = oldLines.length;
  let j = newLines.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.push({ type: 'context', oldNum: i, newNum: j, text: oldLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({ type: 'add', oldNum: null, newNum: j, text: newLines[j - 1] });
      j--;
    } else {
      result.push({ type: 'remove', oldNum: i, newNum: null, text: oldLines[i - 1] });
      i--;
    }
  }

  return result.reverse();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Render unified diff view as HTML */
export function renderUnifiedDiff(lines: DiffLine[]): string {
  let html = '<div class="diff-unified">';
  for (const line of lines) {
    const cls = line.type === 'add' ? 'diff-line-add' : line.type === 'remove' ? 'diff-line-remove' : 'diff-line-context';
    const prefix = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ';
    const oldN = line.oldNum !== null ? String(line.oldNum) : '';
    const newN = line.newNum !== null ? String(line.newNum) : '';
    html += `<div class="diff-line ${cls}">`;
    html += `<span class="diff-line-num">${oldN}</span>`;
    html += `<span class="diff-line-num">${newN}</span>`;
    html += `<span class="diff-line-prefix">${prefix}</span>`;
    html += `<span class="diff-line-text">${escapeHtml(line.text)}</span>`;
    html += `</div>`;
  }
  html += '</div>';
  return html;
}

/** Render side-by-side diff view as HTML */
export function renderSideBySideDiff(lines: DiffLine[]): string {
  // Build paired rows: context lines go together; removes pair with adjacent adds
  const leftRows: { num: number | null; text: string; type: 'context' | 'remove' | 'empty' }[] = [];
  const rightRows: { num: number | null; text: string; type: 'context' | 'add' | 'empty' }[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.type === 'context') {
      leftRows.push({ num: line.oldNum, text: line.text, type: 'context' });
      rightRows.push({ num: line.newNum, text: line.text, type: 'context' });
      i++;
    } else if (line.type === 'remove') {
      // Collect consecutive removes
      const removes: DiffLine[] = [];
      while (i < lines.length && lines[i].type === 'remove') {
        removes.push(lines[i]);
        i++;
      }
      // Collect consecutive adds
      const adds: DiffLine[] = [];
      while (i < lines.length && lines[i].type === 'add') {
        adds.push(lines[i]);
        i++;
      }
      const maxLen = Math.max(removes.length, adds.length);
      for (let k = 0; k < maxLen; k++) {
        if (k < removes.length) {
          leftRows.push({ num: removes[k].oldNum, text: removes[k].text, type: 'remove' });
        } else {
          leftRows.push({ num: null, text: '', type: 'empty' });
        }
        if (k < adds.length) {
          rightRows.push({ num: adds[k].newNum, text: adds[k].text, type: 'add' });
        } else {
          rightRows.push({ num: null, text: '', type: 'empty' });
        }
      }
    } else {
      // Standalone add
      leftRows.push({ num: null, text: '', type: 'empty' });
      rightRows.push({ num: line.newNum, text: line.text, type: 'add' });
      i++;
    }
  }

  let html = '<div class="diff-side-by-side">';
  for (let r = 0; r < leftRows.length; r++) {
    const left = leftRows[r];
    const right = rightRows[r];
    const leftCls = left.type === 'remove' ? 'diff-line-remove' : left.type === 'empty' ? 'diff-line-empty' : 'diff-line-context';
    const rightCls = right.type === 'add' ? 'diff-line-add' : right.type === 'empty' ? 'diff-line-empty' : 'diff-line-context';
    html += `<div class="diff-sbs-row">`;
    html += `<div class="diff-sbs-left ${leftCls}">`;
    html += `<span class="diff-line-num">${left.num ?? ''}</span>`;
    html += `<span class="diff-line-text">${escapeHtml(left.text)}</span>`;
    html += `</div>`;
    html += `<div class="diff-sbs-right ${rightCls}">`;
    html += `<span class="diff-line-num">${right.num ?? ''}</span>`;
    html += `<span class="diff-line-text">${escapeHtml(right.text)}</span>`;
    html += `</div>`;
    html += `</div>`;
  }
  html += '</div>';
  return html;
}

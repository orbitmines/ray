// Lanes: one region run on many inputs at once, each lane its own cells, no calls, forks or system calls.
// What a GPU can run; `lanes` here is the same thing on the CPU, for when there is no GPU.
//
// A lane starts at the region's first entry with its input in cell 0 and ends at an EXIT: (exit, value).

import { N, ENTRIES, size, JUMP, IF, EXIT, SET, ADD, SUB, MUL, LT, EQ } from '../core/program.ts';
import { int, truthy } from '../core/word.ts';
import { NOTHING } from '../core/word.ts';

export const MAX_CELLS = 32, BUDGET = 1 << 20;

const lane_ops = new Set([JUMP, IF, EXIT, SET, ADD, SUB, MUL, LT, EQ]);

// Whether every instruction reachable from the region's first entry is one a lane can run. `region` is image-relative.
export function eligible(image: Int32Array, region: number): boolean {
  if (image[region + N] > MAX_CELLS) return false;
  const seen = new Set<number>(), todo = [image[region + ENTRIES]];
  while (todo.length > 0) {
    const pc = todo.pop()!;
    if (seen.has(pc)) continue;
    seen.add(pc);
    const op = image[pc];
    if (!lane_ops.has(op)) return false;
    if (op === JUMP) todo.push(image[pc + 1]);
    else if (op === IF) todo.push(image[pc + 2], image[pc + 3]);
    else if (op !== EXIT) todo.push(pc + size(image, pc));
  }
  return true;
}

// Runs the lanes on the CPU; answers (exit, value) per lane, exit -1 when a lane did not finish.
export function lanes(image: Int32Array, region: number, inputs: Int32Array): Int32Array {
  const out = new Int32Array(2 * inputs.length), cells = new Int32Array(MAX_CELLS);
  for (let lane = 0; lane < inputs.length; lane++) {
    cells.fill(NOTHING); cells[0] = inputs[lane];
    const get = (o: number) => o < 0 ? image[-o - 1] : cells[o];
    let pc = image[region + ENTRIES];
    out[2 * lane] = -1;
    for (let step = 0; step < BUDGET; step++) {
      const op = image[pc];
      if (op === JUMP) { pc = image[pc + 1]; continue; }
      if (op === IF) { pc = truthy(get(image[pc + 1])) ? image[pc + 2] : image[pc + 3]; continue; }
      if (op === EXIT) { out[2 * lane] = image[pc + 1]; out[2 * lane + 1] = get(image[pc + 2]); break; }
      if (op === SET) { cells[image[pc + 1]] = get(image[pc + 2]); pc += 3; continue; }
      const a = get(image[pc + 2]), b = get(image[pc + 3]);
      cells[image[pc + 1]] = op === ADD ? a + b : op === SUB ? a - b : op === MUL ? int((a >> 2) * (b >> 2)) : op === LT ? int(a < b ? 1 : 0) : int(a === b ? 1 : 0);
      pc += 4;
    }
  }
  return out;
}

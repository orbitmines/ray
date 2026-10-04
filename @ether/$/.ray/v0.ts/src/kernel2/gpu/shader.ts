// The WGSL for lanes, as text (so every platform can load it without a loader for .wgsl files).
export const shader = /* wgsl */ `
// Lanes on the GPU: the same instructions as gpu/lanes.ts, one invocation per lane, over the program image as it is.
// Words keep their tags: an integer n is n << 2; NOTHING is 2.

struct Params { region: i32, lanes: i32, budget: i32, unused: i32 }

@group(0) @binding(0) var<storage, read> image: array<i32>;
@group(0) @binding(1) var<storage, read> inputs: array<i32>;
@group(0) @binding(2) var<storage, read_write> outputs: array<i32>;
@group(0) @binding(3) var<uniform> params: Params;

var<private> cells: array<i32, 32>;

fn operand(o: i32) -> i32 {
  if (o < 0) { return image[-o - 1]; }
  return cells[o];
}

fn truthy(w: i32) -> bool { return w != 0 && w != 2; }

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let lane = i32(id.x);
  if (lane >= params.lanes) { return; }
  for (var k = 0; k < 32; k++) { cells[k] = 2; }
  cells[0] = inputs[lane];
  var pc = image[params.region + 3];
  outputs[2 * lane] = -1;
  for (var step = 0; step < params.budget; step++) {
    let op = image[pc];
    switch op {
      case 1: { pc = image[pc + 1]; }
      case 2: { if (truthy(operand(image[pc + 1]))) { pc = image[pc + 2]; } else { pc = image[pc + 3]; } }
      case 6: { outputs[2 * lane] = image[pc + 1]; outputs[2 * lane + 1] = operand(image[pc + 2]); return; }
      case 7: { cells[image[pc + 1]] = operand(image[pc + 2]); pc += 3; }
      case 8: { cells[image[pc + 1]] = operand(image[pc + 2]) + operand(image[pc + 3]); pc += 4; }
      case 9: { cells[image[pc + 1]] = operand(image[pc + 2]) - operand(image[pc + 3]); pc += 4; }
      case 10: { cells[image[pc + 1]] = ((operand(image[pc + 2]) >> 2u) * (operand(image[pc + 3]) >> 2u)) << 2u; pc += 4; }
      case 11: { cells[image[pc + 1]] = select(0, 4, operand(image[pc + 2]) < operand(image[pc + 3])); pc += 4; }
      case 12: { cells[image[pc + 1]] = select(0, 4, operand(image[pc + 2]) == operand(image[pc + 3])); pc += 4; }
      default: { outputs[2 * lane] = -2; return; }
    }
  }
}
`;

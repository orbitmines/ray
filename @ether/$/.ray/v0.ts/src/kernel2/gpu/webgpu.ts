// Lanes on a GPU through WebGPU (browsers, Deno; Node has no `navigator.gpu`). An image is uploaded once and kept.

import { shader } from './shader.ts';
import { BUDGET } from './lanes.ts';

export class Gpu {
  private images = new Map<Int32Array, any>();

  private constructor(private device: any, private pipeline: any) {}

  static async create(): Promise<Gpu | undefined> {
    const gpu = (globalThis as any).navigator?.gpu;
    const adapter = await gpu?.requestAdapter();
    if (adapter === undefined || adapter === null) return undefined;
    const device = await adapter.requestDevice();
    const module = device.createShaderModule({ code: shader });
    const errors = (await module.getCompilationInfo()).messages.filter((m: any) => m.type === 'error');
    if (errors.length > 0) throw new Error('lanes shader: ' + errors.map((m: any) => `${m.lineNum}: ${m.message}`).join('; '));
    const pipeline = device.createComputePipeline({ layout: 'auto', compute: { module, entryPoint: 'main' } });
    return new Gpu(device, pipeline);
  }

  private buffer(data: Int32Array, usage: number) {
    const b = this.device.createBuffer({ size: Math.max(16, data.byteLength), usage, mappedAtCreation: true });
    new Int32Array(b.getMappedRange()).set(data);
    b.unmap();
    return b;
  }

  // (exit, value) per lane, as gpu/lanes.ts answers them.
  async lanes(image: Int32Array, region: number, inputs: Int32Array): Promise<Int32Array> {
    const d = this.device, U = (globalThis as any).GPUBufferUsage;
    let program = this.images.get(image);
    if (program === undefined) this.images.set(image, program = this.buffer(image, U.STORAGE));
    const input = this.buffer(inputs, U.STORAGE);
    const bytes = 8 * inputs.length;
    const output = d.createBuffer({ size: bytes, usage: U.STORAGE | U.COPY_SRC });
    const read = d.createBuffer({ size: bytes, usage: U.MAP_READ | U.COPY_DST });
    const params = this.buffer(new Int32Array([region, inputs.length, BUDGET, 0]), U.UNIFORM);
    const group = d.createBindGroup({ layout: this.pipeline.getBindGroupLayout(0), entries: [program, input, output, params].map((buffer, binding) => ({ binding, resource: { buffer } })) });
    const encoder = d.createCommandEncoder(), pass = encoder.beginComputePass();
    pass.setPipeline(this.pipeline); pass.setBindGroup(0, group);
    pass.dispatchWorkgroups(Math.ceil(inputs.length / 64));
    pass.end();
    encoder.copyBufferToBuffer(output, 0, read, 0, bytes);
    d.queue.submit([encoder.finish()]);
    await read.mapAsync((globalThis as any).GPUMapMode.READ);
    const out = new Int32Array(read.getMappedRange().slice(0));
    read.unmap();
    for (const b of [input, output, read, params]) b.destroy();
    return out;
  }
}

import Ray from "./ray";

describe("ray", () => {
  test(".traverse", () => {
    let ray = new Ray([1, 2, 3, 4, 5]);

    expect(ray).not.toBe(Ray.none)

    expect(ray).toBe(Ray.initial)
    expect(ray()).toBe(1)
    expect(ray()()).toBe(2)
    expect(ray()()()).toBe(3)
    expect(ray()()()()).toBe(4)
    expect(ray()()()()()).toBe(5)
    expect(ray()()()()()()).toBe(Ray.terminal)

    expect(ray.next.times(4)).toBe(4)

    expect(ray.previous.times(1)).toBe(Ray.initial.extreme)
    expect(ray.previous.times(2)).toBe(Ray.none)

    expect(ray.next.times(7)).toBe(Ray.terminal.extreme)
    expect(ray.next.times(8)).toBe(Ray.none)

    if ('all' in ray)
      delete ray.all
  });
})
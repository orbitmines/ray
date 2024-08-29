import Ray, { one_or_many } from "./ray";

describe("ray", () => {
  test(".Cursor", () => {
    const t = one_or_many([1,2,3], [5, 10, 15])
    console.log(t)
    console.log(t.map(value => value * 2))
    console.log(t.filter(value => value % 5 === 0))
    console.log(t.length)
  })
  test("Minimal setup", () => {
    let ray = new Ray(1, 2, 3, 4, 5);
    ray.all.test = 2
    ray.all.test = (value: any) => value * 2
    console.log(ray.all.test)
    delete ray.all.test
    console.log(ray.all.test)

    // We cannot see the difference between any definition of `.none`.
    // expect(Ray.none).toBe(Ray.none)
    // expect(Ray.none).toEqual(Ray.none)
    // We cannot see the difference between any instantiation of `.none`.
    // expect(Ray.none()).toBe(Ray.none())
    // expect(Ray.initial()).toBe(Ray.initial())
    // expect(Ray.self()).toBe(Ray.self())
    // expect(Ray.terminal()).toBe(Ray.terminal())
    // We CAN see the difference between a definition & instantiation of `.none`. - "They'd be different types"
    // expect(Ray.none).not.toBe(Ray.none())
    // expect(Ray.initial).not.toBe(Ray.initial())
    // expect(Ray.self).not.toBe(Ray.self())
    // expect(Ray.terminal).not.toBe(Ray.terminal()) TODO
    // We can see the difference between each function definition.
    // expect(Ray.none).not.toBe(Ray.initial)
    // expect(Ray.none).not.toBe(Ray.self)
    // expect(Ray.none).not.toBe(Ray.terminal)
    // expect(Ray.null).not.toBe(Ray.undefined)

    // expect(Ray.none()).toBe(Ray.true)

    // expect(A.compose(B)).toBe(A)
    // expect(A.next()).toBe(B)
    //
    // expect(A.is_none()).toBe(Ray.boolean(false))
    //

    // let ray = new Ray(1, 2, 3, 4, 5);
    //
    // expect(ray).not.toBe(Ray.none)
    //
    // expect(ray).toBe(Ray.initial)
    // expect(ray()).toBe(1)
    // expect(ray()()).toBe(2)
    // expect(ray()()()).toBe(3)
    // expect(ray()()()()).toBe(4)
    // expect(ray()()()()()).toBe(5)
    // expect(ray()()()()()()).toBe(Ray.terminal)
    //
    // expect(ray.next.times(4)).toBe(4)
    //
    // expect(ray.previous.times(1)).toBe(Ray.initial.extreme)
    // expect(ray.previous.times(2)).toBe(Ray.none)
    //
    // expect(ray.next.times(7)).toBe(Ray.terminal.extreme)
    // expect(ray.next.times(8)).toBe(Ray.none)
    //
    // if ('all' in ray)
    //   delete ray.all
  });
})
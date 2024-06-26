// Ray.__instance__.__set__ = () => {
//
// }
//   // Used by jest for toEqual.
//   protected asymmetricMatch: any
//     if (DEBUG) console.log('__new__', args)
//   export class __debug__ extends __ray__ {
//
//
//     __get__ = (property: string | symbol): any => {
//       console.log('__get__', property)
//
//       if (String(property) === 'asymmetricMatch') return this.asymmetricMatch
//
//       return super.__get__(property)
//     }
//     /** ray.property = something; */ __set__ = (property: string | symbol, value: any): boolean => {
//       if (String(property) === 'asymmetricMatch') {
//         this.asymmetricMatch = value;
//         return true;
//       }
//       if (DEBUG) console.log('__set__', property)
//     }
//   }
//

import {__ray__} from "./ray";

const Ray = __ray__({ DEBUG: true })

describe("ray", () => {
  test("Minimal setup", () => {
    // expect(Ray.none.is_none()).toBe(undefined)

    // expect(Ray.none).toBe('none')
    //
    // We cannot see the difference between any definition of `.none`.
    expect(Ray.none).toBe(Ray.none)
    expect(Ray.none).toEqual(Ray.none)
    // We cannot see the difference between any instantiation of `.none`.
    expect(Ray.none()).toBe(Ray.none())
    expect(Ray.initial()).toBe(Ray.initial())
    expect(Ray.self()).toBe(Ray.self())
    expect(Ray.terminal()).toBe(Ray.terminal())
    // We CAN see the difference between a definition & instantiation of `.none`. - "They'd be different types"
    expect(Ray.none).not.toBe(Ray.none())
    // expect(Ray.initial).not.toBe(Ray.initial())
    // expect(Ray.self).not.toBe(Ray.self())
    // expect(Ray.terminal).not.toBe(Ray.terminal()) TODO
    // We can see the difference between each function definition.
    // expect(Ray.none).not.toBe(Ray.initial)
    // expect(Ray.none).not.toBe(Ray.self)
    // expect(Ray.none).not.toBe(Ray.terminal)
    // expect(Ray.null).not.toBe(Ray.undefined)

    // expect(Ray.none()).toBe(Ray.true)

    // let A = new Ray(false)
    // let B = new Ray(true)

    // expect(A.compose(B)).toBe(A)
    // expect(A.next()).toBe(B)
    //
    // expect(A.is_none()).toBe(Ray.boolean(false))
    //
    // let ray = new Ray([1, 2, 3, 4, 5]);
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
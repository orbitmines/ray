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
//   export const is_boolean = (_object: any): _object is boolean => _.isBoolean(_object);
//   export const is_number = (_object: any): _object is number => _.isNumber(_object);
//   export const is_object = (_object: any): _object is object => _.isObject(_object);
//   export const is_iterable = <T = any>(_object: any): _object is Iterable<T> => Symbol.iterator in Object(_object) && is_function(_object[Symbol.iterator]);
//   export const is_async_iterable = <T = any>(_object: any): _object is AsyncIterable<T> => Symbol.asyncIterator in Object(_object) && is_function(_object[Symbol.asyncIterator]);
//   export const is_array = <T = any>(_object: any): _object is T[] => _.isArray(_object);
//   export const is_async = (_object: any) => _.has(_object, 'then') && is_function(_.get(_object, 'then')); // TODO, Just an ugly check
//
//   export const is_error = (_object: any): _object is Error => _.isError(_object);}
import Ray from "./ray";

describe("ray", () => {
  test("Minimal setup", () => {

    expect(Ray.none).toBe(undefined)

    // // We cannot see the difference between any definition of `.none`.
    // expect(Ray.none).toBe(Ray.none)
    // expect(Ray.none).toEqual(Ray.none)
    // // We can see the difference between each function definition.
    // expect(Ray.none).not.toBe(Ray.initial)
    // expect(Ray.none).not.toBe(Ray.self)
    // expect(Ray.none).not.toBe(Ray.terminal)
    // expect(Ray.null).not.toBe(Ray.undefined)

    // expect(Ray.none()).toBe(Ray.true)

    // console.log(Ray.none())
    // We cannot see the difference between any instantiation of `.none`.
    // expect(Ray.none()).toBe(Ray.none())
    // expect(Ray.initial()).toBe(Ray.initial())
    // expect(Ray.self()).toBe(Ray.self())
    // expect(Ray.terminal()).toBe(Ray.terminal())
    // We CAN see the difference between a definition & instantiation of `.none`. - "They'd be different types"
    // expect(Ray.none).not.toBe(Ray.none())
    // expect(Ray.initial).not.toBe(Ray.initial())
    // expect(Ray.self).not.toBe(Ray.self())
    // expect(Ray.terminal).not.toBe(Ray.terminal())

    // let A = new Ray(false)
    // let B = new Ray(true)
    //
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
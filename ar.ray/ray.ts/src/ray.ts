import RayTs from "../index";

export type Pointer = {
  [key: string | symbol]: Pointer
}

abstract class Node {
  abstract get self(): any
  abstract is_none(): boolean
  is_some = (): boolean => !this.is_none()
}

class Ray implements Iterable<Ray> {
  private __initial__: () => Ray = () => Ray.none(); get initial(): Ray { return this.__initial__() }; set initial(x: Ray | Ray[] | (() => Ray)) { this.__initial__ = () => x instanceof Array ? Ray.iterable(x) : Ray.ref(x instanceof Ray ? x : x()); }
  private __self__: () => Ray = () => Ray.none(); get self(): Ray { return this.__self__() }; set self(x: Ray | Ray[] | (() => Ray)) { this.__self__ = () => x instanceof Array ? Ray.iterable(x) : Ray.ref(x instanceof Ray ? x : x()); }
  private __terminal__: () => Ray = () => Ray.none(); get terminal(): Ray { return this.__terminal__() }; set terminal(x: Ray | Ray[] | (() => Ray)) { this.__terminal__ = () => x instanceof Array ? Ray.iterable(x) : Ray.ref(x instanceof Ray ? x : x()); }

  constructor(object: any = {}) {
    Object.keys(object).forEach(key => (this as any)[key] = object[key]);
  }

  is_initial = () => this.initial.is_none()
  is_terminal = () => this.terminal.is_none()
  is_reference = () => this.is_initial() && this.is_terminal()
  is_boundary = () => xor(this.is_initial(), this.is_terminal())
  is_vertex = () => !this.is_initial() && !this.is_terminal()
  is_extreme = () => this.is_none() && this.is_boundary()
  is_wall = () => this.is_none() && !this.is_initial() && !this.is_terminal()

  private __none__?: boolean // TODO Better solutions for this
  is_none = (): boolean => this.__none__ || this.length === 0;
  is_some = () => !this.is_none()

  get length(): number {
    if (!this.is_boundary()) return 1;

    return [...this].length // TODO: Handle cycles differently?
  }

  *[Symbol.iterator](): Iterator<Ray> {
    // if (!this.is_boundary()) return this;

    // TODO: Abstract away to use Rays instead
    // TODO: Cycle detection & merger
    const queue: Ray[] = [this]
    while (queue.length !== 0) {
      const selected = queue.shift()

      if (selected.is_reference()) {
        yield selected.self;
      } else if (selected.is_initial()) {
        // console.log('INITIAL', [...selected.terminal].length)
        for (let next of selected.terminal) {
          // console.log('VALUE', next.is_reference())
          if (next.is_reference()) {

          } else if (next.is_initial()) {
            // TODO: Could be self-loop
            queue.push(next)
          } else if (next.is_terminal()) {
            queue.push(next)
          } else if (next.is_vertex()) {
            // console.log('VERTEX')
            yield next

            // TODO Better way for __terminal__; differentiate between setting Ray.ref & not
            queue.push(Ray.initial({ __terminal__: () => next.terminal }))
          }
        }
      } else if (selected.is_terminal()) {
        for (let terminal of selected.self) {
          if (terminal.is_reference()) {

          } else if (terminal.is_initial()) {
            queue.push(terminal)
          } else if (terminal.is_terminal()) {
            queue.push(terminal) // TODO: Could be a self-loop
          } else if (terminal.is_vertex()) {
            // TODO Collapse branch
          }
        }
      } else if (selected.is_vertex()) {
        yield selected.self
      }

    }

  }

  static none = () => new Ray({ __none__: true })

  static ref = (x: Ray | Ray[] | (() => Ray)): Ray => new Ray({ __self__: () => x instanceof Array ? Ray.iterable(x) : x instanceof Ray ? x : x() })
  static initial = (object: any = {}) => new Ray({ self: new Ray(), terminal: new Ray(), ...object })
  static vertex = (object: any = {}) => new Ray({ initial: new Ray(), self: new Ray(), terminal: new Ray(), ...object })
  static terminal = (object: any = {}) => new Ray({ initial: new Ray(), self: new Ray(), ...object })

  static iterable = <T>(x: Iterable<T>) => this.iterator(x[Symbol.iterator]());
  static iterator = <T>(x: Iterator<T>) => {
    const next = (previous?: Ray): Ray => {
      const { done, value } = x.next();

      const current = done ? Ray.terminal() : Ray.vertex();
      previous.terminal = current

      if (done) return current

      current.terminal = () => next(current)

      return current
    }

    const iterator = Ray.initial({ terminal: () => next(iterator) });

    return iterator;
  }
}
export default Ray;

// class TempImpl<T> implements Array<T> {
//   [n: number]: T;
//
//   readonly [Symbol.unscopables]: { [K in keyof any[]]?: boolean };
//   length: number;
//
//   [Symbol.iterator](): IterableIterator<T> {
//     return undefined;
//   }
//
//   at(index: number): T | undefined;
//   at(index: number): T | undefined;
//   at(index: number): T | undefined {
//     return undefined;
//   }
//
//   concat(...items: ConcatArray<T>[]): T[];
//   concat(...items: (ConcatArray<T> | T)[]): T[];
//   concat(...items: (ConcatArray<T> | T)[]): T[] {
//     return [];
//   }
//
//   copyWithin(target: number, start: number, end?: number): this {
//     return undefined;
//   }
//
//   entries(): IterableIterator<[number, T]> {
//     return undefined;
//   }
//
//   every<S extends T>(predicate: (value: T, index: number, array: T[]) => value is S, thisArg?: any): this is S[];
//   every(predicate: (value: T, index: number, array: T[]) => unknown, thisArg?: any): boolean;
//   every(predicate, thisArg?: any): any {
//   }
//
//   fill(value: T, start?: number, end?: number): this {
//     return undefined;
//   }
//
//   filter<S extends T>(predicate: (value: T, index: number, array: T[]) => value is S, thisArg?: any): S[];
//   filter(predicate: (value: T, index: number, array: T[]) => unknown, thisArg?: any): T[];
//   filter(predicate, thisArg?: any): any {
//   }
//
//   find<S extends T>(predicate: (value: T, index: number, obj: T[]) => value is S, thisArg?: any): S | undefined;
//   find(predicate: (value: T, index: number, obj: T[]) => unknown, thisArg?: any): T | undefined;
//   find(predicate, thisArg?: any): any {
//   }
//
//   findIndex(predicate: (value: T, index: number, obj: T[]) => unknown, thisArg?: any): number {
//     return 0;
//   }
//
//   findLast<S extends T>(predicate: (value: T, index: number, array: T[]) => value is S, thisArg?: any): S | undefined;
//   findLast(predicate: (value: T, index: number, array: T[]) => unknown, thisArg?: any): T | undefined;
//   findLast(predicate, thisArg?: any): any {
//   }
//
//   findLastIndex(predicate: (value: T, index: number, array: T[]) => unknown, thisArg?: any): number {
//     return 0;
//   }
//
//   flat<A, D = 1 extends number>(depth?: D): FlatArray<A, D>[] {
//     return [];
//   }
//
//   flatMap<U, This = undefined>(callback: (this: This, value: T, index: number, array: T[]) => (ReadonlyArray<U> | U), thisArg?: This): U[] {
//     return [];
//   }
//
//   forEach(callbackfn: (value: T, index: number, array: T[]) => void, thisArg?: any): void {
//   }
//
//   includes(searchElement: T, fromIndex?: number): boolean {
//     return false;
//   }
//
//   indexOf(searchElement: T, fromIndex?: number): number {
//     return 0;
//   }
//
//   join(separator?: string): string {
//     return "";
//   }
//
//   keys(): IterableIterator<number> {
//     return undefined;
//   }
//
//   lastIndexOf(searchElement: T, fromIndex?: number): number {
//     return 0;
//   }
//
//   map<U>(callbackfn: (value: T, index: number, array: T[]) => U, thisArg?: any): U[] {
//     return [];
//   }
//
//   pop(): T | undefined {
//     return undefined;
//   }
//
//   push(...items: T[]): number {
//     return 0;
//   }
//
//   reduce(callbackfn: (previousValue: T, currentValue: T, currentIndex: number, array: T[]) => T): T;
//   reduce(callbackfn: (previousValue: T, currentValue: T, currentIndex: number, array: T[]) => T, initialValue: T): T;
//   reduce<U>(callbackfn: (previousValue: U, currentValue: T, currentIndex: number, array: T[]) => U, initialValue: U): U;
//   reduce(callbackfn, initialValue?): any {
//   }
//
//   reduceRight(callbackfn: (previousValue: T, currentValue: T, currentIndex: number, array: T[]) => T): T;
//   reduceRight(callbackfn: (previousValue: T, currentValue: T, currentIndex: number, array: T[]) => T, initialValue: T): T;
//   reduceRight<U>(callbackfn: (previousValue: U, currentValue: T, currentIndex: number, array: T[]) => U, initialValue: U): U;
//   reduceRight(callbackfn, initialValue?): any {
//   }
//
//   reverse(): T[] {
//     return [];
//   }
//
//   shift(): T | undefined {
//     return undefined;
//   }
//
//   slice(start?: number, end?: number): T[] {
//     return [];
//   }
//
//   some(predicate: (value: T, index: number, array: T[]) => unknown, thisArg?: any): boolean {
//     return false;
//   }
//
//   sort(compareFn?: (a: T, b: T) => number): this {
//     return undefined;
//   }
//
//   splice(start: number, deleteCount?: number): T[];
//   splice(start: number, deleteCount: number, ...items: T[]): T[];
//   splice(start: number, deleteCount?: number, ...items: T[]): T[] {
//     return [];
//   }
//
//   toReversed(): T[] {
//     return [];
//   }
//
//   toSorted(compareFn?: (a: T, b: T) => number): T[] {
//     return [];
//   }
//
//   toSpliced(start: number, deleteCount: number, ...items: T[]): T[];
//   toSpliced(start: number, deleteCount?: number): T[];
//   toSpliced(start: number, deleteCount?: number, ...items: T[]): T[] {
//     return [];
//   }
//
//   unshift(...items: T[]): number {
//     return 0;
//   }
//
//   values(): IterableIterator<T> {
//     return undefined;
//   }
//
//   with(index: number, value: T): T[] {
//     return [];
//   }
// }

// Separate function builder and functionality

const xor = (a: boolean, b: boolean) => (a && !b) || (!a && b)

export type MaybeAsync<T> = T | Promise<T>

export class Ray {}

export interface Node {
  equals: (b: any) => MaybeAsync<boolean>
}

export interface Cursor<T, TCursor extends Cursor<T, TCursor>> {

  current: () => AsyncGenerator<T>

  get next(): TCursor
  has_next: () => MaybeAsync<boolean>
  get previous(): TCursor
  has_previous: () => MaybeAsync<boolean>

  get last(): TCursor
  is_last: () => MaybeAsync<boolean>
  get first(): TCursor
  is_first: () => MaybeAsync<boolean>
  get boundary(): TCursor
  on_boundary: () => MaybeAsync<boolean>

}

// export class StructuredGenerator<T> implements Iterable<T> {
//
// }

// export interface Cursor<T> extends ReadonlyCursor<T> {
//   push: (b: any) => T
//   push_back: (b: any) => T
//   push_front: (b: any) => T
// }

export interface Boundary {
  every: (predicate: (x: Node) => MaybeAsync<boolean>) => MaybeAsync<boolean>
  some: (predicate: (x: Node) => MaybeAsync<boolean>) => MaybeAsync<boolean>

  contains: (b: any) => MaybeAsync<boolean>

}


export default Ray;

// TODO Copy from lodash - remove as a dependency.
import _ from "lodash";
export const is_string = (_object: any): _object is string => _.isString(_object)
export const is_boolean = (_object: any): _object is boolean => _.isBoolean(_object);
export const is_number = (_object: any): _object is number => _.isNumber(_object);
export const is_object = (_object: any): _object is object => _.isObject(_object);
export const is_iterable = <T = any>(_object: any): _object is Iterable<T> => Symbol.iterator in Object(_object) && is_function(_object[Symbol.iterator]);
export const is_async_iterable = <T = any>(_object: any): _object is AsyncIterable<T> => Symbol.asyncIterator in Object(_object) && is_function(_object[Symbol.asyncIterator]);
export const is_array = <T = any>(_object: any): _object is T[] => _.isArray(_object);
export const is_async = (_object: any) => _.has(_object, 'then') && is_function(_.get(_object, 'then')); // TODO, Just an ugly check
export const is_error = (_object: any): _object is Error => _.isError(_object);
export const is_function = (_object: any): _object is ((...args: any[]) => any) => _.isFunction(_object);


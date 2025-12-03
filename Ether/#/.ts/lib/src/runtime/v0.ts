//TODO = removes anything from the previous value from the object (so we need to know the origin of the things that set the vars)
//TODO Keys are encoded on Edges on the Ray node definition.

// The v0 runtime is a specification runtime, without any optimizations.


abstract class ICursor<T> {
  abstract previous?: ICursor<T>
  abstract next?: ICursor<T>
  abstract x: T

  get first() { return this.boundary(x => x.previous); }
  get last() { return this.boundary(x => x.next); }
  boundary = (next: (x: ICursor<T>) => ICursor<T>): ICursor<T> => {
    let current: ICursor<T> = this;
    while (next(current) != undefined) { current = next(current); }
    return current;
  }

  filter = (filter: (x: T) => boolean) => new FilteredCursor(this, filter);
}
class Cursor<T> extends ICursor<T> {
  // static from_iterable = <T>(iterable: Iterable<T>): Cursor<T> => {
  //
  // }

  previous?: ICursor<T>
  next?: ICursor<T>
  constructor(public x: T) { super(); }
}
class FilteredCursor<T> extends ICursor<T> {
  constructor(public unfiltered: ICursor<T>, private _filter: (x: T) => boolean) { super(); }

  get previous() { return this.get_next(x => x.previous) }
  get next() { return this.get_next(x => x.next) }
  private get_next = (next: (x: ICursor<T>) => ICursor<T>): ICursor<T> | undefined => {
    let current: ICursor<T> = this;
    while (next(current) != undefined) {
      if (this._filter(next(current).x)) return new FilteredCursor(next(current), this._filter)
      current = next(current)
    }
    return undefined;
  }

  get x() { return this.unfiltered.x }
}

type Token = string
class Expression extends Cursor<Token> {

  split = (...delimiter: Token[]) => {

  }

  to_string = () => {
    let current: ICursor<Token> = this;
    let string = current.x;
    while (current.next) { string += current.next.x; current = current.next }
    return string;
  }
}

const s = [" ", "\t"]
const DELIMITER = ["/", ".", ...s, ";", "\n"]

class Runtime {

  eval = (...files: Token[]) => {
    console.log(files)
  }
}

const fs = require('fs')
new Runtime().eval(
  fs.readFileSync('../../../Node.ray.txt', "utf8"),
  fs.readFileSync('../../../Program.ray.txt', "utf8"),
)
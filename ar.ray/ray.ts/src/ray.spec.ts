import {Many, Node, Pointer, Query, Ray, Type} from "./ray";

describe("ray", () => {
  test("", async () => {

    const a = <TPointer extends Pointer<TPointer>>() => {
      const exec = new Query.Executor<TPointer>() as Query.Executor<Many<Node>>; // TODO Is this an IntelliJ bug? Doesn't throw TS error, but intellij intellisense doesn't capture this.

      (exec as any as Query.Executor<Ray>).rewrite({
        is_initial: (self) => self.previous().is_empty(),
        is_terminal: (self) => self.next().is_empty(),
        is_reference: (self) => self.is_initial().and(self.is_terminal()),
        is_vertex: (self) => self.is_initial().not().and(self.is_terminal().not()),
        is_boundary: (self) => self.is_initial().xor(self.is_terminal())
      });

      (exec as any as Query.Executor<Node>).rewrite({
        xor: (self, b) =>
          self.and(new self(b).not()).or(self.not().and(b)),
        nor: (self, b) =>
          self.or(b).not(),
        nand: (self, b) =>
          self.and(b).not(),
      })

      exec.rewrite({
        every: (self, predicate) =>
          self.map(x => predicate(x)).filter(x => x.equals(false)).is_empty(),
        some: (self, predicate) =>
          self.filter(x => predicate(x)).is_nonempty(),
        contains: (self, value) =>
          self.some(x => x.equals(value)),
        exclude: (self, predicate) =>
          self.filter(x => new self(predicate(x)).not()),
        reduce_right: (self, callback, initial_value) =>
          self.reverse().reduce(callback, initial_value),

        shift: (self) =>
          self.pop_front(),
        unshift: (self, ...x: any[]) =>
          self.push_front(...x),
        fill: (self, value) =>
          self.all().set(value),
        // TODO: Now doesnt look for negative indexes.
        // index_of = (value: any) =>
        //   this.filter(x => x.equals(value)).distance().all().unique()
        // length: (self) =>
        //   this.distance().filter(x => x.is_last()).map(async x => await x.to_number() + 1).all().unique()
        count: (self) =>
          self.length().max().equals(Infinity).if( // TODO: Or some other smart infinity checker (which looks inside the reduce)
            Infinity,
            self.reduce((acc) => acc.plus(1), 0)
          ),
        // TODO: min/max generalized outside of numbers: Have .Infinity be something which is past x.gt(.last()) = true
        max: (self) => self.reduce((acc, current, cancel) =>
          acc.equals(Infinity).if( // TODO: Or some other smart infinity checker
            cancel,
            acc.gt(current).if(acc, current))
        , undefined),
        min: (self) => self.reduce((acc, current, cancel) =>
          acc.equals(Infinity).if(
            cancel,
            acc.lt(current).if(acc, current))
        , undefined),

        is_nonempty: (self) =>
          self.is_empty().not(),
        is_empty: (self) =>
          self.reduce((acc, current, cancel) => { return false; }, true),

        next: (self) =>
          self.at(1),
        previous: (self) =>
          self.at(-1),
        first: (self) =>
          self.reverse().last(),
        plus: (self, index) =>
          self.at(index),
        minus: (self, index) =>
          self.reverse().at(index),


        has_next: (self) =>
          self.next().is_nonempty(),
        has_previous: (self) =>
          self.previous().is_nonempty(),

        pop_front: (self) =>
          self.first().remove(),
        pop_back: (self) =>
          self.last().remove(),
        push_before: (self, ...x: any[]) =>
          self.reverse().push_after(...x),
        push_back: (self, ...x: any[]) =>
          self.last().push(...x),
        push_front: (self, ...x: any[]) =>
          new self(...x).push_back(self),
      })



    }
    a<Many<Node>>()

    const Any = Query.instance<Type>()
      .filter(x => true)
    const A_or_B = Query.instance<Type>()
      .filter(x => x.equals(A).or(x.equals(B)))

    const JavaScript = {
      Array: Query.instance<Type>()
        // TODO
        // .loop
        // .add(initial)
        // .add(terminal)
        // .filter(x => x.none_selected() Basically graph and x.length().max().lt(2 ^ 32))

    }

    const x = Query.instance<Many<Node>>()
      .filter(async a => true)
      .filter(a => true)
      .filter(a => new a())
      .filter(b => true)
      .filter(b => b.equals(2))

    const A = Query.instance<Many<Node>>()
    const B = Query.instance<Many<Node>>()

    const removed = Query.instance<Many<Node>>()
      // .map(async x => await x.to_number() * 2)
      // .filter(async x => await x.to_number() % 2 === 0)
      .remove()

    A.apply(
      A.push_back('A'),
      A.push_back('B')
    )
    // is the same as
    const applies = A.push_back('A').push_back('B')
    // is the same as
    A.apply(applies)

    A
      .push_back('A')
      .push_back('B')
      .push_back('C')
      .apply(
        A.filter(x => x.equals('B')).remove(),
        // A.filter(async x => await x.to_string() === 'C').remove(),
        A.pop_back(),
        A.pop_back(),
        A.push('D'),
      )

    A.push_front('A')

    // console.log(removed.remove.value)

    // new Ray(1, 2, 3).equals(new Ray(1, 2, 3)) === true
    // new Ray(1, 2, 3).next.equals(1) === true
    // new Ray(1, 2, 3).next.next.equals(2) === true
    // new Ray(A, B: new Ray(1, 2, 3), C).next.next.equals(new Ray(1, 2, 3)) === true

    // new Ray(1, 2, 3).isomorphic(new Ray(A, B, C)) === true
    // new Ray(1, 2, 3).next.isomorphic(new Ray(A, B, C).next) === true
    // new Ray(1, 2, 3).next.isomorphic(new Ray(A, B, C).next.next) === false TODO Does the cursor play a role in the structure yes ???



    // const ray = new Ray()
    //   .bidirectional()
    //   .filter(x => true)
    //   .map(x => x)
    //   .at(Range.Gt(5))
    //   .reverse()
    //
    // new Ray().at(1).at(1)
    // new Ray().at(2)
    // new Ray().next.next
    //
    // new Ray()
    //   .bidirectional()
    //   .at(2)
    //   // -2, 2
    //   .bidirectional() // TODO: Should this be necessary, or does it take the bottom defined one until disabled
    //   .at(1)
    //   // -3, 1, 3, 1
    //
    // new Ray()
    //   .bidirectional()
    //   .at(2)
    //   // -2, 2
    //   .at(1)
    //   // -1, 3
    //
    // new Ray()
    //   .bidirectional()
    //   .at(Range.Gt(5))
    //   // > 5, < -5
    //   .at(1)
    //   // > 6, < -4
    //
    // console.log(ray.reverse.value)

    // const program = new Program();
    //
    // function *g() { while (true) { yield 2; } }
    //
    // const i = new AlteredIterable(
    //   // [1, 2, 3, 1, 2, 2, 3]
    //   g(),
    //   program
    // )
    //   .filter(x => x === 2 || x === 3)
    //   .map(x => x * 2)
    //   .filter(x => x === 4)
    //   .map(x => x * 3)
    //
    // await program.step(async () => {
    //
    //   for await (let value of i) {
    //     console.log(value);
    //   }
    //
    // }, 10)

    //
    // expect(Ray.initial().is_initial()).toBe(true)
    // expect(Ray.vertex().is_vertex()).toBe(true)
    // expect(Ray.terminal().is_terminal()).toBe(true)
    //
    // const ray = Ray.iterable(['A', 'B', 'C'])
    //
    // console.log([...ray].length) // TODO FIX
    // expect(ray.length).toBe(3);
    // expect(ray.current.__object__).toBe('A')
    // expect(ray.at(2).__object__).toBe('C')
    // // expect(ray.last.self.__object__).toBe('C')
    // expect(ray.next.__object__).toBe('B')
    // // expect(ray.next.next.next.self.__object__).toBe('C')
    // expect(ray.type).toBe(Type.INITIAL)
    //
    // ray.at(2).compose(Ray.vertex({ __object__: 'D' }))
    //
    // expect(ray.at(3).__object__).toBe('D')
  });

  // test("", async () => {
  //   const _: Pointer = null!;
  //
  //   const last = _.last
  //   const any = (any: any): Pointer => null!;
  //
  //   // const fn = (A: Pointer) => {
  //   //   (A.last = A).B();
  //   //   any(fn)(A.last = A);
  //   // }
  //
  //   const fn = (A: Pointer) {
  //     A[1][2] = A[4]
  //   }
  // })

  // test("temp", async () => {
  //   const A = new Ray({
  //
  //   }, 'A', 'B', 'C')
  //   const B = new Ray({}, [
  //     [1, 2, 3],
  //     [4, 5, 6],
  //     [7, 8, 9],
  //   ]);
  //
  //   console.log(A.is_some().__object__)
  //
  //   expect([...A]).toEqual([])
  //
  //   const res = []; for await (let el of A) { res.push(el); }
  //   expect(res).toEqual([])
  //
  //
  //   expect(A).toEqual(new Ray())
  // })
  // test("Minimal setup", () => {
  //   expect(Ray.unknown.is_equivalent(Ray.unknown)).toBe(true)
  // });
  // test(".initial = .terminal", () => {
  //   const A = new Ray();
  //   A.initial.equivalent(A.terminal)
  //   A.initial = A.terminal
  //   A.compose(A)
  //
  // })
  // test(".copy", () => {
  //   const A = new Ray();
  //   const B = A.copy();
  //
  //   expect(B.is_isomorphic(A)).toBe(true)
  // })
})
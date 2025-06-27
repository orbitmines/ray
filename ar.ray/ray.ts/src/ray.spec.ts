import {Graph, Many, Node, Pointer, Function, Query, Type} from "./ray";

describe("ray", () => {
  // test("Query.Convertable", async () => {
  //   expect(await new (Query.instance<Node>())(5).to_number()).toBe(5)
  //   expect(await new (Query.instance<Node>())(true).to_boolean()).toBe(true)
  //   expect(await new (Query.instance<Node>())(true, false, true).to_array(x => x.to_boolean())).toEqual([true, false, true])
  //   expect((await new (Query.instance<Node>())(() => 5).to_function())()).toBe(5)
  //   expect(await new (Query.instance<Node>())({ a: 'b' }).to_object()).toEqual({ a: 'b' })
  //   class Clazz { constructor(public a?: string) {} }
  //   expect((await new (Query.instance<Node>())(new Clazz('b')).to_object(Clazz)).a).toEqual('b')
  //   expect(await new (Query.instance<Node>())('a').to_number()).toBe('a')
  //   const map = new Map<string, number>();
  //   map.set('a', 1);
  //   expect((await new (Query.instance<Node>())(map).to_map(key => key.to_string(), value => value.to_number())).get('a')).toBe(1)
  //
  //   for await (let next of Query.instance<Node>()) {
  //
  //   }
  // })
  test("", async () => {

    const a = <TPointer extends Pointer<TPointer>>() => {
      const exec = new Query.Executor<TPointer>() as any as Query.Executor<Many<Node>>; // TODO Is this an IntelliJ bug? Doesn't throw TS error, but intellij intellisense doesn't capture this.

      (exec as any as Query.Executor<Function>).rewrite({
        image: (self) =>
          self.domain().next(),

        // TODO: Is_injective/is_surjective should use some EVERY_IN_SELECTION function. Which is different from .selection().every since that changes the refs to check within the selection. And x.next() would be within the selection.
        // TODO: OR have some way to switch the .next/.previous inside the .every to the one we select for the function.

        is_injective: (self) =>
          // TODO: Differentiate between domain with .next information vs domain without .next information

          self.domain().every(x => x.next().selection().length().max().equals(1))
            // TODO: Assumes I can do .previous, either memorized or some reversible function
            // TODO: Allow for construction which is: Match x.previous to [SOMETHING].next() which yields x
            .and(self.image().every(x => x.previous().selection().length().max().equals(1)))
            // TODO: Different references of the same value might exist
            .and(self.image().selection().every(x => x.is_unique())),
          //   .and(self.domain().selection().length().max().equals(self.image().selection().length().max()))
        is_surjective: (self) =>
          self.codomain().every(x => x.previous().selection().length().max().equals(1)),
        is_bijective: (self) =>
          self.is_injective().and(self.is_surjective()),

        // TODO: A homomorphism is a map between two algebraic structures of the same type (e.g. two groups, two fields, two vector spaces), that preserves the operations of the structures.
        // TODO: How to construct this weaker type check.
        // is_homomorphism: (self) =>
        //   each element in self.domain() [SAME TYPE OF STRUCTURE] self.codomain(),
        // TODO iso, endo, auto are all homomorphisms
        is_isomorphism: (self) =>
          self.is_homomorphism().and(self.is_bijective()),
        // is_endomorphism: (self) =>
        //   self.domain() = self.codomain(), (without the references to .next)
        is_automorphism: (self) =>
          // self.is_endomorphism().and(self.is_isomorphism()),
          self.is_endomorphism().and(self.is_bijective()),

        is_monomorphism: (self) =>
          self.is_injective().and(self.is_homomorphism()),
      });

      (exec as any as Query.Executor<Node>).rewrite({
        xor: (self, b) =>
          // a && !b || (!a && b)
          // self.and(new self(b).not()).or(self.not().and(b)),
          // (a && !b) || (!a && b)
          self.group(self => self.and(new self(b).not())).or(self.not().and(b)),
        nor: (self, b) =>
          self.or(b).not(),
        nand: (self, b) =>
          self.and(b).not(),

        // TODO: For number you'd want to overwrite these rewrites with some operator call
        // TODO: self.instance_of(JavaScript.Number) && [number-line context selected] => self. [executes with] (>= operator)
        // TODO: Needs to distinguish between some custom number-line, and the default one.
        gte: (self, value) => self.reduce_right((acc, current, cancel) =>
          acc.if(cancel, current.equals(value))
        , undefined),
        gt: (self, value) => self.reduce_right((acc, current, cancel) =>
          acc.if(cancel, acc.equals(undefined) /* TODO: More generally, a: "is this the first check" */.if(false, current.equals(value)))
        , undefined),
        lte: (self, value) => self.reduce((acc, current, cancel) =>
          acc.if(cancel, current.equals(value))
        , undefined),
        lt: (self, value) => self.reduce((acc, current, cancel) =>
          acc.if(cancel, acc.equals(undefined).if(false, current.equals(value)))
        , undefined)

      });

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

        step_by: (self, step) =>
          self.filter((x, index) => index.mod(step).equals(0)),
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
        plus: (self, ...index) =>
          self.at(...index),
        minus: (self, ...index) =>
          self.reverse().at(...index),
        plus_minus: (self, ...index) =>
          self.plus(...index).or(self.minus(...index)),

        has_next: (self) =>
          self.next().is_nonempty(),
        has_previous: (self) =>
          self.previous().is_nonempty(),

        // TODO
        // set: (self, value) =>
        //   self.history().push_back(value),
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


    // 'A'.equals('B') Easy, just replace the local .equals('B') = true
    // 'B'.equals('A') Expects us to have some way of finding B.
    // TODO: So we'd .equivalence an entire direction, but used when?
    // Equivalence frame A = B
    // const ANY = Query.instance<Node>()
    //   .rewrite(self => self.equals, true)
    // const a_ = Query.instance<Node>()
    //   .rewrite(self => self.equals('B'), true)


    const Any = Query.instance<Type<Node>>()
      .matches(x => true)
    const A_or_B = Query.instance<Type<Node>>()
      .matches(x => x.equals(A).or(x.equals(B)))

    // TODO: Within some context we define as a .ts/.js section (albeit file or substructure deemed as such)
    //        -> "Array" or [] type references are referencing this type.
    //        -> Outside that context we could have things like JavaScript.Array or Array, or "imported as Array" which is superposed between other programming languages (ambiguity)
    const JavaScript = {
      // TODO: JavaScript.Array(Number) -> number[], place Number type on top of a particular named node: "element".
      // TODO:
      Array: Query.instance<Type<Graph>>()
        // TODO
        // .loop
        // .add(initial)
        // .add(terminal)
        // TODO Apply to loop only, not the initial/terminal dangling edge
        .matches(x => x.length().max().lt(2 ^ 32))

      // TODO What about number, which has enumerable values like Infinity and -Infinity, and then the rest of the structure in between.
      // TODO Number, requires functions defined on it as well, it is not just the structure.
      // TODO -> But those functions might not be used in any particular instance, so the type changes based on that.

      // TODO Even something like Javascript "any" is a restricted type. It only contains Array.or(Number).or(...)
    }

    const x = Query.instance<Many<Node>>()
      .filter(async a => true)
      .filter(a => true)
      .filter(a => new a())
      .filter(b => true)
      .filter(b => b.equals(2))

    const A = Query.instance<Many<Node>>()
    const B = Query.instance<Many<Node>>()

    const C = A
      .push_back('A')
      .push_back('B')

    // TODO : Even though .filter changes the nodes, they should still be removeable like this
    // TODO .all() here or not: Is it the selection we remove or the entire structure?
    C.apply(C.filter(x => x.equals('B')).remove())
    C.apply(C.filter(x => x.equals('B')).all().remove())

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
  });
})
import Ray, {PushStrategy, RemoveStrategy} from "./ray";

describe("ray", () => {
  test("", async () => {
    const A = new Ray()

    const removed = await new Ray()
      .map(async x => await x.to_number() * 2)
      .filter(async x => await x.to_number() % 2 === 0)
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
        A.filter(async x => await x.to_string() === 'C').remove(),
        A.pop_back(),
        A.pop_back(),
        A.push('D'),
      )

    A.push_front('A')

    console.log(removed.remove.value)

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
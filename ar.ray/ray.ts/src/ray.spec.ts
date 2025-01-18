import Ray, {Pointer} from "./ray";


describe("ray", () => {
  test("", async () => {

    expect(Ray.initial().is_initial()).toBe(true)
    expect(Ray.vertex().is_vertex()).toBe(true)
    expect(Ray.terminal().is_terminal()).toBe(true)

    const ray = Ray.iterable([1, 2, 3])
    expect(ray.length).toBe(3);
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
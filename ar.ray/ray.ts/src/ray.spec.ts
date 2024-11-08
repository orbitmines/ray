import Ray from "./ray";

describe("ray", () => {
  test("temp", async () => {
    const A = new Ray({

    }, 'A', 'B', 'C')
    const B = new Ray({}, [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
    ]);

    console.log(A.is_some().__object__)

    expect([...A]).toEqual([])

    const res = []; for await (let el of A) { res.push(el); }
    expect(res).toEqual([])


    expect(A).toEqual(new Ray())
  })
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
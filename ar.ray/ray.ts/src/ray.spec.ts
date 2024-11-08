import Ray from "./ray";

describe("ray", () => {
  test("Minimal setup", () => {
    const ray = new Ray();
    console.log(Ray.unknown.is_equivalent(Ray.unknown))
  });
  test(".initial = .terminal", () => {
    const A = new Ray();
    A.initial.equivalent(A.terminal)
    A.initial = A.terminal
    A.compose(A)

  })
  test(".copy", () => {
    const A = new Ray();
    const B = A.copy();

    expect(B.is_isomorphic(A)).toBe(true)
  })
})
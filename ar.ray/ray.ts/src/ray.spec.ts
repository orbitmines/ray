import Ray from "./ray";

describe("ray", () => {
  test(".traverse", () => {
    let ray = new Ray(1, 2, 3);
    ray()

    if ('all' in ray)
      delete ray.all
  });
})
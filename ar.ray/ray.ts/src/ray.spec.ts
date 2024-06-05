import Ray from "./ray";

describe("ray", () => {
  test(".traverse", () => {
    let ray = new Ray(1, 2, 3);
    console.log(ray)
    console.log(ray())


    // const events: any[] = [];
    // const ray = Ray.array([]);
    //
    // if (ray) {
    //   ray.is_orbit();
    //
    // }
    // new ray.initial;
    // ray.initial = new ray();
    // ray.initial = ray.terminal();
    // ray.initial = (self): Ray.Any => {}
    // ray.initial = Ray.Function.Self.Impl((self) => {})

    if ('all' in ray)
      delete ray.all
  });
})
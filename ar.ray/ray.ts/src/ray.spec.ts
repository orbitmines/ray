import Ray from "./ray";

describe("ray", () => {
  test(".traverse", () => {
    let ray = new Ray(1, 2, 3);
    console.log('1', ray)
    console.log('3', ray.terminal)
    console.log('2', ray())


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
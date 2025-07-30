import earcut from "./earcut";
import Font from "./opentype.js/font.mjs";

import {parse} from "./opentype.js/opentype.mjs"

// export type Font = {
//   glyphs: {
//     [char: string]: {
//       ha: number,
//       x_min: number,
//       x_max: number,
//       o: string
//     };
//   },
//   familyName: string,
//   ascender: number,
//   descender: number,
//   underlinePosition: number,
//   underlineThickness: number,
//   boundingBox: {
//     yMin: number,
//     xMin: number,
//     yMax: number,
//     xMax: number
//   },
//   resolution: number,
//   original_font_information: {
//     format: number,
//     copyright: string,
//     fontFamily: string,
//     fontSubfamily: string,
//     uniqueID: string,
//     fullName: string,
//     version: string,
//     postScriptName: string,
//     trademark: string,
//     manufacturer: string,
//     designer: string,
//     manufacturerURL: string,
//     designerURL: string,
//     license: string,
//     licenseURL: string,
//     preferredFamily: string,
//     preferredSubfamily: string,
//   },
//   cssFontWeight: string,
//   cssFontStyle: string,
// }

export class FontStore {

  fonts: Font[] = [];

  // TODO: Remember how to retrieve the font for loading.
  index = () => {
    throw new Error('not yet implemented');
  }

  load = (buffer: ArrayBuffer) => {
    this.fonts.push(parse(buffer))
  }
  // unload = (font: Font) => {
  //   this.fonts = this.fonts.filter(f => f !== font)
  //   // TODO: Remove cached glyphs
  // }

  glyph = (char: string, options?: { font: Font }): Glyph => {
    for (let font of options?.font ? [options.font, ...this.fonts] : this.fonts) {
      const glyph = font.charToGlyph(char);
      if (glyph.index === 0)
        continue;

      (font as any).__cached_glyphs ??= {};

      if ((font as any).__cached_glyphs[char])
        return (font as any).__cached_glyphs[char]

      // TODO Merge opentype.Glyph and this glyph.
      const o = glyph.toPathData().toLowerCase().replaceAll('m', ' m ').replaceAll('l', ' l ').replaceAll("q", ' q ').replaceAll("b", ' b ').replaceAll("z", ' z ').replaceAll("-", " -").replaceAll("  ", " ").replace(/^\s/, "");

      (font as any).__cached_glyphs[char] = Glyph.parse(o);
      (font as any).__cached_glyphs[char].font = font;
      (font as any).__cached_glyphs[char].advanceWidth = glyph.advanceWidth;
      return (font as any).__cached_glyphs[char]
    }

    if (this.fonts.length === 0)
      throw new Error('No fonts loaded')

    // TODO: Return a glyph not this glyph
    throw new Error('not yet implemented')
    return this.fonts[0].glyphs.get(0) // .notdef
  }
}

function cache(
  target: any,
  propertyKey: string,
  descriptor: PropertyDescriptor
) {
  const originalMethod = descriptor.value;
  const cacheKey = Symbol(`__cache_${propertyKey}`);

  descriptor.value = function (...args: any[]) {
    if (!(this as any)[cacheKey]) {
      (this as any)[cacheKey] = new Map<string, any>();
    }

    const key = JSON.stringify(args);
    if ((this as any)[cacheKey].has(key)) {
      return (this as any)[cacheKey].get(key);
    }

    const result = originalMethod.apply(this, args);
    (this as any)[cacheKey].set(key, result);
    return result;
  };

  return descriptor;
}

export class Glyph {
  private shapes: Shape[] = []
  public font: Font
  public advanceWidth: number

  constructor(polygons: Path[]) {
    const holes = polygons.filter(polygon => !polygon.isClockWise())
    const outer = polygons.filter(polygon => polygon.isClockWise())

    for (let path of outer) {
      this.shapes.push(new Shape(path, holes))
    }
  }

  toPoints = (segmentsPerCurve = 100) => {
    const points: Vec2[] = []
    this.shapes.forEach(shape => points.push(...shape.toPoints(segmentsPerCurve)))
    return points;
  }

  @cache
  toTriangles({ segmentsPerCurve = 100 }) {
    const triangles: Triangle[] = []
    this.shapes.forEach(shape => triangles.push(...shape.toTriangles({ segmentsPerCurve })))
    return triangles;
  }

  static parse = (string: string) => new Glyph(Path.parse(string))
}
export class Shape {

  constructor(private path: Path, private holes: Path[] = []) {
  }

  toPoints = (segmentsPerCurve = 100) => {
    const points: Vec2[] = []
    points.push(...this.path.toPoints(segmentsPerCurve))
    this.holes.forEach(hole => points.push(...hole.toPoints(segmentsPerCurve)))
    return points;
  }

  toTriangles = ({ segmentsPerCurve = 100 }) => {
    return earcut(this.path.toPoints(segmentsPerCurve), ...this.holes.map(hole => hole.toPoints(segmentsPerCurve)))
  }
}
export class Path {
  private parent: Path
  private operator: keyof Path
  private args: Vec2[]

  constructor(parent?: Path, operator?: keyof Path, args?: Vec2[]) {
    this.parent = parent; this.operator = operator; this.args = args;
  }

  area = () => {
    const contour = this.toPoints()
    const n = contour.length;
    let a = 0.0;

    for ( let p = n - 1, q = 0; q < n; p = q ++ ) {
      a += contour[ p ].x * contour[ q ].y - contour[ q ].x * contour[ p ].y;
    }

    return a * 0.5;
  }

  isClockWise = () => this.area() < 0;

  moveTo = (to: Vec2) => new Path(this, 'moveTo', [to])
  lineTo = (to: Vec2) => new Path(this, 'lineTo', [to])
  quadraticBezierTo = (end: Vec2, controlPoint: Vec2) => new Path(this, 'quadraticBezierTo', [end, controlPoint])
  // TODO: Is this the right order for cubic args?
  cubicBezierTo = (end: Vec2, controlPoint1: Vec2, controlPoint2: Vec2) => new Path(this, 'cubicBezierTo', [end, controlPoint1, controlPoint2])

  toPoints = (segmentsPerCurve = 100) => {
    const points: Vec2[] = []

    let current: Vec2

    for (let operation of this.listOperations()) {
      switch (operation.operator) {
        case 'moveTo': {
          const [to] = operation.args;

          current = to;

          if (points.length !== 0)
            throw new Error('Unknown whether moveTo operation is a new shape, or a hole inside an existing one. Please use Glyph.toPoints instead, which sorts this out.')

          points.push(to)

          break;
        }
        case 'lineTo': {
          const [to] = operation.args;

          for (let t = 0; t <= segmentsPerCurve; t += 1) {
            points.push(new Vec2(
              current.x + (to.x - current.x) * (t / segmentsPerCurve),
              current.y + (to.y - current.y) * (t / segmentsPerCurve),
            ))
          }

          current = to;
          break;
        }
        case 'quadraticBezierTo': {
          const [controlPoint, end] = operation.args;
          // TODO: For opentype.js vs jetbrains json these are swapped, why? Which one is incorrect?

          const quadraticBezier = (t: number) => new Vec2(
            (1 - t)**2 * current.x + 2 * (1 - t) * t * controlPoint.x + t**2 * end.x,
            (1 - t)**2 * current.y + 2 * (1 - t) * t * controlPoint.y + t**2 * end.y
          );

          for (let t = 0; t <= segmentsPerCurve; t += 1) {
            points.push(quadraticBezier(t / segmentsPerCurve));
          }

          current = end;
          break;
        }
        case 'cubicBezierTo': {
          throw new Error('Implement TODO')

          // function cubicBezier(p0, p1, p2, p3, t) {
          //   const mt = 1 - t;
          //   const x = mt**3 * p0[0] + 3 * mt**2 * t * p1[0] + 3 * mt * t**2 * p2[0] + t**3 * p3[0];
          //   const y = mt**3 * p0[1] + 3 * mt**2 * t * p1[1] + 3 * mt * t**2 * p2[1] + t**3 * p3[1];
          //   return [x, y];
          // }

          // // TODO: The order of these arguments is probably incorrect, see 'q'.
          // const end = [path[i++], path[i++]];
          // const cp1 = [path[i++], path[i++]];
          // const cp2 = [path[i++], path[i++]];
          // for (let t = 0; t <= 1; t += 0.01) {
          //   points.push(cubicBezier(current, end, cp2, cp1, t));
          // }
          // current = end;
          break;
        }
      }
    }

    return points;
  }

  private listOperations = (): Path[] => {
    const list: Path[] = [];

    let current: Path = this;
    while (current && current.operator !== undefined) {
      list.unshift(current);
      current = current.parent;
    }

    return list;
  }

  static parse = (string: string): Path[] => {
    let path: Path = undefined
    let polygons: Path[] = []

    const args = string.trim().split(/\s+/)
    let i = 0;

    const next = () => new Vec2(parseFloat(args[i++]), parseFloat(args[i++]))
    while (i < args.length) {
      const operator = args[i++]

      switch (operator) {
        case 'm':
          if (path?.operator !== undefined) polygons.push(path);

          path = new Path().moveTo(next())
          break;
        case 'l':
          path = path.lineTo(next())
          break;
        case 'q':
          path = path.quadraticBezierTo(next(), next())
          break;
        case 'b':
          path = path.cubicBezierTo(next(), next(), next())
          break;
        case 'z':
          polygons.push(path);
          path = undefined;
          break;
      }
    }

    if (path !== undefined)
      polygons.push(path);

    return polygons;
  }
}
export class Triangle {
  constructor(public a: Vec2, public b: Vec2, public c: Vec2) {
  }

  // signed area
  area = () => {
    return (this.b.y - this.a.y) * (this.c.x - this.b.x) - (this.b.x - this.a.x) * (this.c.y - this.b.y);
  }

  offset_x = (offset: number) => {
    const r = this.clone();
    r.a.x += offset;
    r.b.x += offset;
    r.c.x += offset;
    return r;
  }
  offset_y = (offset: number) => {
    const r = this.clone();
    r.a.y += offset;
    r.b.y += offset;
    r.c.y += offset;
    return r;
  }
  scale_x = (scale: number) => {
    const r = this.clone();
    r.a.x *= scale;
    r.b.x *= scale;
    r.c.x *= scale;
    return r;
  }
  scale_y = (scale: number) => {
    const r = this.clone();
    r.a.y *= scale;
    r.b.y *= scale;
    r.c.y *= scale;
    return r;
  }
  clone = () => {
    return new Triangle(this.a.clone(), this.b.clone(), this.c.clone())
  }
}
export class Vec2 {
  constructor(public x: number, public y: number) {
  }

  clone = () => new Vec2(this.x, this.y);

  equals = (b: Vec2): boolean => this.x === b.x && this.y === b.y;

  isInsideTriangle = (triangle: Triangle) => {
    return (triangle.c.x - this.x) * (triangle.a.y - this.y) >= (triangle.a.x - this.x) * (triangle.c.y - this.y) &&
      (triangle.a.x - this.x) * (triangle.b.y - this.y) >= (triangle.b.x - this.x) * (triangle.a.y - this.y) &&
      (triangle.b.x - this.x) * (triangle.c.y - this.y) >= (triangle.c.x - this.x) * (triangle.b.y - this.y);
  }
}
import earcut from "./earcut";

export type Font = {
  glyphs: {
    [char: string]: {
      ha: number,
      x_min: number,
      x_max: number,
      o: string
    };
  },
  familyName: string,
  ascender: number,
  descender: number,
  underlinePosition: number,
  underlineThickness: number,
  boundingBox: {
    yMin: number,
    xMin: number,
    yMax: number,
    xMax: number
  },
  resolution: number,
  original_font_information: {
    format: number,
    copyright: string,
    fontFamily: string,
    fontSubfamily: string,
    uniqueID: string,
    fullName: string,
    version: string,
    postScriptName: string,
    trademark: string,
    manufacturer: string,
    designer: string,
    manufacturerURL: string,
    designerURL: string,
    license: string,
    licenseURL: string,
    preferredFamily: string,
    preferredSubfamily: string,
  },
  cssFontWeight: string,
  cssFontStyle: string,
}

export const font = (json: string): Font => {
  const data: Font = JSON.parse(json);
  // data.scale = (size: number) => size / data.resolution;
  // data.line_height = (size: number) => (data.boundingBox.yMax - data.boundingBox.yMin + data.underlineThickness) * data.scale(size);
  return data;
}

export class Glyph {
  private shapes: Shape[] = []

  constructor(polygons: Path[]) {
    const shapes: Map<Path, Path[]> = new Map();
    for (let polygon of polygons) {
      const holes = polygons.filter(inside => inside !== polygon && inside.toPoints().some(point => point.isInsidePolygon(polygon)))
      shapes.set(polygon, holes)
    }

    const isHole = (path: Path) => {
      let numberOfOutsidePolygons = 0;
      for (let [_, holes] of shapes) {
        if (holes.includes(path)) numberOfOutsidePolygons += 1;
      }

      // Polygons can be completely inside other polygons and still need to be filled. (So they're not a hole)
      return numberOfOutsidePolygons % 2 == 1;
    }

    for (let [path, holes] of shapes) {
      if (isHole(path)) continue;

      this.shapes.push(new Shape(path, holes.filter(hole => isHole(hole))));
    }
  }

  toPoints = (segmentsPerCurve = 100) => {
    const points: Vec2[] = []
    this.shapes.forEach(shape => points.push(...shape.toPoints(segmentsPerCurve)))
    return points;
  }

  toTriangles = ({ scale = 1, xOffset = 0, yOffset = 0, segmentsPerCurve = 100 }) => {
    const triangles: number[] = []
    this.shapes.forEach(shape => triangles.push(...shape.toTriangles({ scale, xOffset, yOffset, segmentsPerCurve })))
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

  toTriangles = ({ scale = 1, xOffset = 0, yOffset = 0, segmentsPerCurve = 100 }) => {
    const points: Vec2[] = []
    const holeIndices: number[] = []

    points.push(...this.path.toPoints(segmentsPerCurve))
    this.holes.forEach(hole => {
      holeIndices.push(points.length)

      points.push(...hole.toPoints(segmentsPerCurve))
    })

    const triangleVertices = earcut(points.map(point => [point.x, point.y]).flat(), holeIndices) // returns triplets of vertex numbers

    const scaledPoints = points.map(point => [point.x * scale + xOffset, point.y * scale + yOffset])
    return triangleVertices.map(vertex => [scaledPoints[vertex][0], scaledPoints[vertex][1]]).flat()
  }
}
export class Path {
  private parent: Path
  private operator: keyof Path
  private args: Vec2[]

  constructor(parent?: Path, operator?: keyof Path, args?: Vec2[]) {
    this.parent = parent; this.operator = operator; this.args = args;
  }

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
          const [end, controlPoint] = operation.args;

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
    let path: Path = new Path();
    let polygons: Path[] = []

    const args = string.trim().split(/\s+/)
    let i = 0;

    const next = () => new Vec2(parseFloat(args[i++]), parseFloat(args[i++]))
    while (i < args.length) {
      const operator = args[i++]

      switch (operator) {
        case 'm':
          if (path.operator !== undefined) polygons.push(path);

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
          break;
      }
    }

    return polygons;
  }
}
export class Vec2 {
  constructor(public x: number, public y: number) {}

  // from three.js
  isInsidePolygon = (polygon: Path) => {
    const inPolygon = polygon.toPoints()

    const polyLen = inPolygon.length;

    // inPt on polygon contour => immediate success    or
    // toggling of inside/outside at every single! intersection point of an edge
    //  with the horizontal line through inPt, left of inPt
    //  not counting lowerY endpoints of edges and whole edges on that line
    let inside = false;
    for ( let p = polyLen - 1, q = 0; q < polyLen; p = q ++ ) {

      let edgeLowPt = inPolygon[ p ];
      let edgeHighPt = inPolygon[ q ];

      let edgeDx = edgeHighPt.x - edgeLowPt.x;
      let edgeDy = edgeHighPt.y - edgeLowPt.y;

      if ( Math.abs( edgeDy ) > Number.EPSILON ) {

        // not parallel
        if ( edgeDy < 0 ) {

          edgeLowPt = inPolygon[ q ]; edgeDx = - edgeDx;
          edgeHighPt = inPolygon[ p ]; edgeDy = - edgeDy;

        }

        if ( ( this.y < edgeLowPt.y ) || ( this.y > edgeHighPt.y ) ) 		continue;

        if ( this.y === edgeLowPt.y ) {

          if ( this.x === edgeLowPt.x )		return	true;		// this is on contour ?
          // continue;				// no intersection or edgeLowPt => doesn't count !!!

        } else {

          const perpEdge = edgeDy * ( this.x - edgeLowPt.x ) - edgeDx * ( this.y - edgeLowPt.y );
          if ( perpEdge === 0 )				return	true;		// this is on contour ?
          if ( perpEdge < 0 ) 				continue;
          inside = ! inside;		// true intersection left of this

        }

      } else {

        // parallel or collinear
        if ( this.y !== edgeLowPt.y ) 		continue;			// parallel
        // edge lies on the same horizontal line as this
        if ( ( ( edgeHighPt.x <= this.x ) && ( this.x <= edgeLowPt.x ) ) ||
          ( ( edgeLowPt.x <= this.x ) && ( this.x <= edgeHighPt.x ) ) )		return	true;	// this: Point on contour !
        // continue;

      }

    }

    return	inside;

  }
}
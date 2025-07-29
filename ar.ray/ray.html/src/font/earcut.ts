import {Triangle, Vec2} from "./font";

export default function earcut(points: Vec2[], ...holes: Vec2[][]): Triangle[] {
  const earcut = new Earcut(points, ...holes)
  return earcut.triangles;
}

function compareXYSlope(a: Node, b: Node) {
  let result = a.x - b.x;
  // when the left-most point of 2 holes meet at a vertex, sort the holes counterclockwise so that when we find
  // the bridge to the outer shell is always the point that they meet at.
  if (result === 0) {
    result = a.y - b.y;
    if (result === 0) {
      const aSlope = (a.next.y - a.y) / (a.next.x - a.x);
      const bSlope = (b.next.y - b.y) / (b.next.x - b.x);
      result = aSlope - bSlope;
    }
  }
  return result;
}


// signed area of a triangle
function area(p: Node, q: Node, r: Node) {
  return (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
}

// check if two segments intersect
function intersects(p1: Node, q1: Node, p2: Node, q2: Node) {
  const o1 = sign(area(p1, q1, p2));
  const o2 = sign(area(p1, q1, q2));
  const o3 = sign(area(p2, q2, p1));
  const o4 = sign(area(p2, q2, q1));

  if (o1 !== o2 && o3 !== o4) return true; // general case

  if (o1 === 0 && onSegment(p1, p2, q1)) return true; // p1, q1 and p2 are collinear and p2 lies on p1q1
  if (o2 === 0 && onSegment(p1, q2, q1)) return true; // p1, q1 and q2 are collinear and q2 lies on p1q1
  if (o3 === 0 && onSegment(p2, p1, q2)) return true; // p2, q2 and p1 are collinear and p1 lies on p2q2
  if (o4 === 0 && onSegment(p2, q1, q2)) return true; // p2, q2 and q1 are collinear and q1 lies on p2q2

  return false;
}

// for collinear points p, q, r, check if point q lies on segment pr
function onSegment(p: Node, q: Node, r: Node) {
  return q.x <= Math.max(p.x, r.x) && q.x >= Math.min(p.x, r.x) && q.y <= Math.max(p.y, r.y) && q.y >= Math.min(p.y, r.y);
}

function sign(num: number) {
  return num > 0 ? 1 : num < 0 ? -1 : 0;
}


// Based on https://github.com/mapbox/earcut/blob/main/src/earcut.js
class Earcut {
  holes: Vec2[][];
  triangles: Triangle[] = [];

  constructor(public points: Vec2[], ...holes: Vec2[][]) {
    this.holes = holes;

    let outerNode = this.linkedList(this.points, { clockwise: true })
    if (!outerNode || outerNode.next === outerNode.prev) return;

    if (holes.length > 0) outerNode = outerNode.eliminateHoles()

    // outerNode.earcut_linked()
    outerNode.earcutLinked();

  }

  private _bounding_box: { min: Vec2; max: Vec2 };
  get bounding_box() {
    if (this._bounding_box) return this._bounding_box;

    const min = new Vec2(Infinity, Infinity);
    const max = new Vec2(-Infinity, -Infinity);

    for (let point of this.points) {
      if (point.x < min.x) min.x = point.x;
      if (point.y < min.y) min.y = point.y;
      if (point.x > max.x) max.x = point.x;
      if (point.y > max.y) max.y = point.y;
    }

    return this._bounding_box = { min, max }
  }

  get inverse_size() {
    const inverse_size = Math.max(this.bounding_box.max.x - this.bounding_box.min.x, this.bounding_box.max.y - this.bounding_box.min.y);
    return inverse_size !== 0 ? 32767 / inverse_size : 0;
  }

  use_z_order_curve_hash = () => this.points.length + this.holes.flat().length > 80

  // create a circular doubly linked list from polygon points in the specified winding order
  linkedList = (points: Vec2[], options: { clockwise: boolean }) => {
    let last;

    for (let point of options.clockwise === (signed_area(points) > 0) ? points : points.reverse()) {
      const next = new Node(this, point)
      last?.insert(next)
      last = next;
    }

    if (last?.equals(last.next)) {
      last.remove()
      last = last.next;
    }

    return last;
  }

}

class Node {
  prev: Node // previous and next vertex nodes in a polygon ring
  next: Node
  prevZ: Node // previous and next nodes in z-order
  nextZ: Node
  steiner: boolean = false // indicates whether this is a steiner point

  get x() { return this.coordinates.x; }
  get y() { return this.coordinates.y; }

  private _z: number = 0
  get z() {
    if (this._z !== 0) return this._z;

    // coords are transformed into non-negative 15-bit integer range
    let x = this.x; let y = this.y;

    x = (x - this.earcut.bounding_box.min.x) * this.earcut.inverse_size | 0;
    y = (y - this.earcut.bounding_box.min.y) * this.earcut.inverse_size | 0;

    x = (x | (x << 8)) & 0x00FF00FF;
    x = (x | (x << 4)) & 0x0F0F0F0F;
    x = (x | (x << 2)) & 0x33333333;
    x = (x | (x << 1)) & 0x55555555;

    y = (y | (y << 8)) & 0x00FF00FF;
    y = (y | (y << 4)) & 0x0F0F0F0F;
    y = (y | (y << 2)) & 0x33333333;
    y = (y | (y << 1)) & 0x55555555;

    return x | (y << 1);
  }

  constructor(public earcut: Earcut, public coordinates: Vec2) {
    this.prev = this;
    this.next = this;
  }

  some = (predicate: (x: Node) => boolean) => {
    let p: Node = this;
    do {
      if (predicate(p)) return true;
      p = p.next;
    } while (p !== this);

    return false;
  }
  for_each = (predicate: (x: Node) => void) => {
    let p: Node = this;

    do {
      predicate(p)

      p = p.next;
    } while (p !== this);
  }
  *[Symbol.iterator](): Iterator<Node> {
    let p: Node = this;

    do {
      yield p;

      p = p.next;
    } while (p !== this);
  }

  insert = (after: Node) => {
    after.next = this.next;
    after.prev = this;
    this.next.prev = after;
    this.next = after;
  }

  remove = () => {
    this.next.prev = this.prev;
    this.prev.next = this.next;

    if (this.nextZ) this.nextZ.prevZ = this.prevZ;
    if (this.prevZ) this.prevZ.nextZ = this.nextZ;
  }

  // find the leftmost node of a polygon ring
  get leftmost() {
    const start: Node = this;
    let p = start,
      leftmost = start;
    do {
      if (p.x < leftmost.x || (p.x === leftmost.x && p.y < leftmost.y)) leftmost = p;
      p = p.next;
    } while (p !== start);

    return leftmost;
  }

  equals = (b: Node) => {
    return this.coordinates.equals(b.coordinates)
  }

  // check if a diagonal between two polygon nodes is valid (lies in polygon interior)
  isValidDiagonal = (b: Node) => {
    const a = this;

    return !a.next.equals(b) && !a.prev.equals(b) && !a.intersectsPolygon(b) && // doesn't intersect other edges
      (a.locallyInside(b) && b.locallyInside(a) && a.middleInside(b) && // locally visible
        (area(a.prev, a, b.prev) || area(a, b.prev, b)) || // does not create opposite-facing sectors
        a.equals(b) && area(a.prev, a, a.next) > 0 && area(b.prev, b, b.next) > 0); // special zero-length case
  }

  // check if a polygon diagonal intersects any polygon segments
  intersectsPolygon = (b: Node) =>
    this.some((p) => !p.equals(this) && !p.next.equals(this) && !p.equals(b) && !p.next.equals(b) &&
      intersects(p, p.next, this, b))

  // check if a polygon diagonal is locally inside the polygon
  locallyInside = (b: Node) => {
    const a = this;
    return area(a.prev, a, a.next) < 0 ?
      area(a, b, a.next) >= 0 && area(a, a.prev, b) >= 0 :
      area(a, b, a.prev) < 0 || area(a, a.next, b) < 0;
  }

  // check if the middle point of a polygon diagonal is inside the polygon
  middleInside = (b: Node) => {
    let inside = false;
    const px = (this.x + b.x) / 2;
    const py = (this.y + b.y) / 2;

    this.for_each(p => {
      if (((p.y > py) !== (p.next.y > py)) && p.next.y !== p.y &&
        (px < (p.next.x - p.x) * (py - p.y) / (p.next.y - p.y) + p.x))
        inside = !inside;
    })

    return inside;
  }

  // whether sector in vertex m contains sector in vertex p in the same coordinates
  containsSector = (p: Node) => {
    const m = this;
    return area(m.prev, m, p.prev) < 0 && area(p.next, m, m.next) < 0;
  }

  // eliminate colinear or duplicate points
  filtered = (end?: Node): Node => {
    const start: Node = this;

    if (!start) return start;
    if (!end) end = start;

    let p = start,
      again;
    do {
      again = false;

      if (!p.steiner && (p.equals(p.next) || area(p.prev, p, p.next) === 0)) {
        p.remove()
        p = end = p.prev;
        if (p === p.next) break;
        again = true;

      } else {
        p = p.next;
      }
    } while (again || p !== end);

    return end;
  }

  // main ear slicing loop which triangulates a polygon (given as a linked list)
  earcutLinked = (pass: 0 | 1 | 2 = 0) => {
    let ear: Node = this;

    if (!ear) return;

    // interlink polygon nodes in z-order
    if (!pass && this.earcut.use_z_order_curve_hash()) ear.indexCurve();

    let stop = ear;

    // iterate through ears, slicing them one by one
    while (ear.prev !== ear.next) {
      const prev = ear.prev;
      const next = ear.next;

      if (this.earcut.use_z_order_curve_hash() ? ear.isEarHashed() : ear.isEar()) {
        this.earcut.triangles.push(new Triangle(prev.coordinates, ear.coordinates, next.coordinates)) // cut off the triangle

        ear.remove()

        // skipping the next vertex leads to less sliver triangles
        ear = next.next;
        stop = next.next;

        continue;
      }

      ear = next;

      // if we looped through the whole remaining polygon and can't find any more ears
      if (ear === stop) {
        // try filtering points and slicing again
        if (!pass) {
          ear.filtered().earcutLinked(1);

          // if this didn't work, try curing all small self-intersections locally
        } else if (pass === 1) {
          ear = ear.filtered().cureLocalIntersections();
          ear.earcutLinked(2);

          // as a last resort, try splitting the remaining polygon into two
        } else if (pass === 2) {
          ear.splitEarcut();
        }

        break;
      }
    }
  }

  // check whether a polygon node forms a valid ear with adjacent nodes
  isEar = () => {
    const a = this.prev,
      b = this,
      c = this.next;
    const triangle = new Triangle(a.coordinates, b.coordinates, c.coordinates)

    if (triangle.area() >= 0) return false; // reflex, can't be an ear

    // triangle bbox
    const bounding_box = {
      min: new Node(this.earcut, new Vec2(Math.min(a.x, b.x, c.x), Math.min(a.y, b.y, c.y))),
      max: new Node(this.earcut, new Vec2(Math.max(a.x, b.x, c.x), Math.max(a.y, b.y, c.y))),
    }

    let p = c.next;
    while (p !== a) {
      if (p.x >= bounding_box.min.x && p.x <= bounding_box.max.x && p.y >= bounding_box.min.y && p.y <= bounding_box.max.y &&
        !a.equals(p) && p.coordinates.isInsideTriangle(triangle) &&
        area(p.prev, p, p.next) >= 0) return false;
      p = p.next;
    }

    return true;
  }

  isEarHashed = () => {
    const ear = this;
    const a = ear.prev,
      b = ear,
      c = ear.next;
    const triangle = new Triangle(a.coordinates, b.coordinates, c.coordinates)

    if (triangle.area() >= 0) return false;

    // triangle bbox
    const bounding_box = {
      min: new Node(this.earcut, new Vec2(Math.min(a.x, b.x, c.x), Math.min(a.y, b.y, c.y))),
      max: new Node(this.earcut, new Vec2(Math.max(a.x, b.x, c.x), Math.max(a.y, b.y, c.y))),
    }

    let p = ear.prevZ,
      n = ear.nextZ;

    // look for points inside the triangle in both directions
    while (p && p.z >= bounding_box.min.z && n && n.z <= bounding_box.max.z) {
      if (p.x >= bounding_box.min.x && p.x <= bounding_box.max.x && p.y >= bounding_box.min.y && p.y <= bounding_box.max.y && p !== a && p !== c &&
        !a.equals(p) && p.coordinates.isInsideTriangle(triangle) && area(p.prev, p, p.next) >= 0) return false;
      p = p.prevZ;

      if (n.x >= bounding_box.min.x && n.x <= bounding_box.max.x && n.y >= bounding_box.min.y && n.y <= bounding_box.max.y && n !== a && n !== c &&
        !a.equals(n) && n.coordinates.isInsideTriangle(triangle) && area(n.prev, n, n.next) >= 0) return false;
      n = n.nextZ;
    }

    // look for remaining points in decreasing z-order
    while (p && p.z >= bounding_box.min.z) {
      if (p.x >= bounding_box.min.x && p.x <= bounding_box.max.x && p.y >= bounding_box.min.y && p.y <= bounding_box.max.y && p !== a && p !== c &&
        !a.equals(p) && p.coordinates.isInsideTriangle(triangle) && area(p.prev, p, p.next) >= 0) return false;
      p = p.prevZ;
    }

    // look for remaining points in increasing z-order
    while (n && n.z <= bounding_box.max.z) {
      if (n.x >= bounding_box.min.x && n.x <= bounding_box.max.x && n.y >= bounding_box.min.y && n.y <= bounding_box.max.y && n !== a && n !== c &&
        !a.equals(n) && n.coordinates.isInsideTriangle(triangle) && area(n.prev, n, n.next) >= 0) return false;
      n = n.nextZ;
    }

    return true;
  }

  // go through all polygon nodes and cure small local self-intersections
  cureLocalIntersections = () => {
    let start: Node = this;
    let p = start;
    do {
      const a = p.prev,
        b = p.next.next;

      if (!a.equals(b) && intersects(a, p, p.next, b) && a.locallyInside(b) && b.locallyInside(a)) {

        this.earcut.triangles.push(new Triangle(a.coordinates, p.coordinates, b.coordinates))

        // remove two nodes involved
        p.remove()
        p.next.remove()

        p = start = b;
      }
      p = p.next;
    } while (p !== start);

    return p.filtered()
  }

  // try splitting polygon into two and triangulate them independently
  splitEarcut = () => {
    const start: Node = this;
    // look for a valid diagonal that divides the polygon into two
    let a = start;
    do {
      let b = a.next.next;
      while (b !== a.prev) {
        if (!a.equals(b) && a.isValidDiagonal(b)) {
          // split the polygon in two by the diagonal
          let c = a.split(b);

          // filter colinear points around the cuts
          a = a.filtered(a.next);
          c = c.filtered(c.next);

          // run earcut on each half
          a.earcutLinked();
          c.earcutLinked();
          return;
        }
        b = b.next;
      }
      a = a.next;
    } while (a !== start);
  }

  // link every hole into the outer loop, producing a single-ring polygon without holes
  eliminateHoles = () => {
    const queue = [];

    for (let hole of this.earcut.holes) {
      const list = this.earcut.linkedList(hole, { clockwise: false });
      if (!list) continue;
      if (list === list.next) list.steiner = true;
      queue.push(list.leftmost);
    }

    queue.sort(compareXYSlope);

    // process holes from left to right
    let outerNode: Node = this;
    for (let i = 0; i < queue.length; i++) {
      outerNode = outerNode.eliminateHole(queue[i]);
    }

    return outerNode;
  }

  // find a bridge between vertices that connects hole with an outer ring and and link it
  eliminateHole = (hole: Node) => {
    const outerNode = this;
    const bridge = outerNode.findHoleBridge(hole);
    if (!bridge) {
      return outerNode;
    }

    const bridgeReverse = bridge.split(hole);

    // filter collinear points around the cuts
    bridgeReverse.filtered(bridgeReverse.next);
    return bridge.filtered(bridge.next);
  }

  // David Eberly's algorithm for finding a bridge between hole and outer polygon
  findHoleBridge = (hole: Node) => {
    const outerNode: Node = this;
    let p = outerNode;
    let qx = -Infinity;
    let m: Node;

    // find a segment intersected by a ray from the hole's leftmost point to the left;
    // segment's endpoint with lesser x will be potential connection point
    // unless they intersect at a vertex, then choose the vertex
    if (hole.equals(p)) return p;

    for (let p of [...this]) {
      if (hole.equals(p.next)) return p.next;
      else if (hole.y <= p.y && hole.y >= p.next.y && p.next.y !== p.y) {
        const x = p.x + (hole.y - p.y) * (p.next.x - p.x) / (p.next.y - p.y);
        if (x <= hole.x && x > qx) {
          qx = x;
          m = p.x < p.next.x ? p : p.next;
          if (x === hole.x) return m; // hole touches outer segment; pick leftmost endpoint
        }
      }
    }

    if (!m) return null;

    // look for points inside the triangle of hole point, segment intersection and endpoint;
    // if there are no points found, we have a valid connection;
    // otherwise choose the point of the minimum angle with the ray as connection point

    let tanMin = Infinity;

    m.for_each(p => {
      if (hole.x >= p.x && p.x >= m.x && hole.x !== p.x &&
        p.coordinates.isInsideTriangle(new Triangle(new Vec2(hole.y < m.y ? hole.x : qx, hole.y), m.coordinates, new Vec2(hole.y < m.y ? qx : hole.x, hole.y)))) {

        const tan = Math.abs(hole.y - p.y) / (hole.x - p.x); // tangential

        if (p.locallyInside(hole) &&
          (tan < tanMin || (tan === tanMin && (p.x > m.x || (p.x === m.x && m.containsSector(p)))))) {
          m = p;
          tanMin = tan;
        }
      }
    })

    return m;
  }

  // interlink polygon nodes in z-order
  indexCurve = () => {
    const start: Node = this;
    let p = start;
    do {
      p.prevZ = p.prev;
      p.nextZ = p.next;
      p = p.next;
    } while (p !== start);

    p.prevZ.nextZ = null;
    p.prevZ = null;

    p.sort()
  }

  // Simon Tatham's linked list merge sort algorithm
  // http://www.chiark.greenend.org.uk/~sgtatham/algorithms/listsort.html
  sort = () => {
    let list: Node = this;
    let numMerges;
    let inSize = 1;

    do {
      let p = list;
      let e;
      list = null;
      let tail = null;
      numMerges = 0;

      while (p) {
        numMerges++;
        let q = p;
        let pSize = 0;
        for (let i = 0; i < inSize; i++) {
          pSize++;
          q = q.nextZ;
          if (!q) break;
        }
        let qSize = inSize;

        while (pSize > 0 || (qSize > 0 && q)) {

          if (pSize !== 0 && (qSize === 0 || !q || p.z <= q.z)) {
            e = p;
            p = p.nextZ;
            pSize--;
          } else {
            e = q;
            q = q.nextZ;
            qSize--;
          }

          if (tail) tail.nextZ = e;
          else list = e;

          e.prevZ = tail;
          tail = e;
        }

        p = q;
      }

      tail.nextZ = null;
      inSize *= 2;

    } while (numMerges > 1);

    return list;
  }

  // link two polygon vertices with a bridge; if the vertices belong to the same ring, it splits polygon into two;
  // if one belongs to the outer ring and another to a hole, it merges it into a single ring
  split = (b: Node) => {
    const a = this;
    const a2 = new Node(this.earcut, new Vec2(a.x, a.y)),
      b2 = new Node(this.earcut, new Vec2(b.x, b.y)),
      an = a.next,
      bp = b.prev;

    a.next = b;
    b.prev = a;

    a2.next = an;
    an.prev = a2;

    b2.next = a2;
    a2.prev = b2;

    bp.next = b2;
    b2.prev = bp;

    return b2;
  }
}

// // return a percentage difference between the polygon area and its triangulation area;
// // used to verify correctness of triangulation
// export function deviation(data, holeIndices, dim, triangles) {
//   const hasHoles = holeIndices && holeIndices.length;
//   const outerLen = hasHoles ? holeIndices[0] * dim : data.length;
//
//   let polygonArea = Math.abs(signedArea(data, 0, outerLen, dim));
//   if (hasHoles) {
//     for (let i = 0, len = holeIndices.length; i < len; i++) {
//       const start = holeIndices[i] * dim;
//       const end = i < len - 1 ? holeIndices[i + 1] * dim : data.length;
//       polygonArea -= Math.abs(signedArea(data, start, end, dim));
//     }
//   }
//
//   let trianglesArea = 0;
//   for (let i = 0; i < triangles.length; i += 3) {
//     const a = triangles[i] * dim;
//     const b = triangles[i + 1] * dim;
//     const c = triangles[i + 2] * dim;
//     trianglesArea += Math.abs(
//       (data[a] - data[c]) * (data[b + 1] - data[a + 1]) -
//       (data[a] - data[b]) * (data[c + 1] - data[a + 1]));
//   }
//
//   return polygonArea === 0 && trianglesArea === 0 ? 0 :
//     Math.abs((trianglesArea - polygonArea) / polygonArea);
// }
//
// function signedArea(data, start, end, dim) {
//   let sum = 0;
//   for (let i = start, j = end - dim; i < end; i += dim) {
//     sum += (data[j] - data[i]) * (data[i + 1] + data[j + 1]);
//     j = i;
//   }
//   return sum;
// }

const signed_area = (points: Vec2[]) => {
  let sum = 0;

  let previous = points[points.length - 1];
  for (let current of points) {
    sum += (previous.x - current.x) * (current.y + previous.y)
    previous = current;
  }
  return sum;
}
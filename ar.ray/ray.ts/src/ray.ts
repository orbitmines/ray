import {exec} from "node:child_process";

export type MaybeAsync<T> = T | Promise<T>


export namespace Query {
  export namespace Property {
    export type MappedValue<T> = T extends void ? void : T | Query.Type<Node>
    export type MappedFunction<T extends (...args: any[]) => any> = T extends (...args: infer Args) => infer Result ? (...args: { [Arg in keyof Args]: Args[Arg] extends Node ? Query.Type<Args[Arg]> : Args[Arg] }) => MaybeAsync<MappedValue<Result>> : never;
    export type MappedArgument<T> = T extends (...args: any[]) => any ? MappedFunction<T> : MappedValue<T>
    export type MappedArguments<T> =
      0 extends (1 & T) /* T = any? */ ? [MappedArgument<T>] :
        T extends void ? [] :
          T extends any[] ? { [K in keyof T]: MappedArgument<T[K]> } :
            [MappedArgument<T>]

    export type Type<TValue, TNextQuery> = {
      (...value: MappedArguments<TValue>): Query.Type<TNextQuery>
    }
  }

  export type Type<T> = {
    [P in keyof T]: T[P] extends (...args: infer Args) => infer Query ? Property.Type<Args, Query> : never
  } & {
    new (...args: any[]): Query.Type<Node>
    (): Instance
  }

  export const instance = <T>(): Type<T> => new Instance().__proxy__ as Type<T>

  export class Instance {

    // TODO: Construct a ray instead of using __parent__ here.
    __parent__?: Instance
    __property__: string | symbol
    __value__?: any

    __get__ = (property: string | symbol): any => {
        return <TValue, TNextQuery>(...value: Property.MappedArguments<TValue>): TNextQuery => {
          const x = new Instance();
          x.__parent__ = this;
          x.__property__ = property;
          x.__value__ = value;
          return x.__proxy__ as TNextQuery;
        }
    }

    __call__ = (...args: any[]): any => this;
    __construct__ = (...args: any[]): any => {
      const x = new Instance();
      x.__value__ = args;

      // TODO: Non-hacky way of checking for Node.
      try {
        if (args.length === 1 && args[0].prototype !== undefined) {}
      } catch  {
        return args[0] as Query.Type<Node>;
      }

      return x.__proxy__ as Query.Type<Node>;
    }
    // __set__ = (property: string | symbol, value: any): boolean => {  }
    // __has__ = (property: string | symbol): boolean => {  }
    // __delete__ = (property: string | symbol): any => {  }

    get __proxy__(): any { return new Proxy(class {}, {
      apply: (_: any, thisArg: any, argArray: any[]): any => this.__call__(...argArray),
      // set: (_: any, property: string | symbol, newValue: any, receiver: any): boolean => this.__set__(property, newValue),
      get: (_: any, property: string | symbol, receiver: any): any => this.__get__(property),
      // has: (_: any, property: string | symbol): boolean => this.__has__(property),
      construct: (_: any, argArray: any[], newTarget: Function): object => this.__construct__(...argArray),
      // deleteProperty: (_: any, property: string | symbol): boolean => this.__delete__(property)
    }) }

  }

  // TODO: Requires knowledge of what operation can effect what.
  // TODO: Could figure out what can be done in parallel and what can't.
  // TODO: Say I used push_back somewhere and I question .last right after. It becomes: .last before is no longer relevant. "If there is a terminal, so push_back has a target, then it is that value there.)
  export class Executor<T> {

    // TODO: Rewrite to many targets used in which situation?
    // TODO: Cross-rewrite with an implementation choosing which one (nand vs . vs .)
    rewrite = (implementations: {
      [P in keyof Query.Type<T>]?: Query.Type<T>[P] extends (...args: infer Args) => infer TNextQuery ? (self: Query.Type<T>, ...args: Args) => TNextQuery : never
    }): Executor<T> => {
      return this;
    }

    // TODO THEOREM PROVING (All these things can be rewritten to all these other things -> because I can reach them, or because that is the conclusion )
    // TODO: Rewrite specific values (theorem proving)
    //        What about an infinitely generating structure which we through some other finite method proof holds for this predicate?
    //        Proven that there's no terminal, .last returns empty, more elaborate theorem proving system


  }
}

export enum RemoveStrategy {
  /**
   * Preserves structure around the removed selection.
   * This is akin to removing elements from an array.
   */
  PRESERVE_STRUCTURE = "PRESERVE_STRUCTURE",
  /**
   * Removes all connectivity around the selection.
   * This is akin to removing a vertex and all incoming/outgoing edges.
   *
   *   // TODO, Should only sever connections which are NOT in the selection. ?
   */
  SEVER_CONNECTIVITY = "SEVER_CONNECTIVITY"
}

export interface Pointer<TSelf extends Pointer<TSelf>> {
  /**
   * Applies successive transformation and returns the result.
   */
  apply: (...queries: any[]) => TSelf

  every: (predicate: (x: Node) => boolean) => Node
  some: (predicate: (x: Node) => boolean) => Node
  contains: (value: any) => Node

  map: (predicate: (x: Node) => any) => TSelf
  /**
   *
   * Note: If a node is currently selected and falls outside the filter, the node will be deselected.
   */
  filter: (predicate: (x: Node) => boolean) => TSelf
  /**
   * Opposite of 'filter'.
   */
  exclude: (predicate: (x: Node) => boolean) => TSelf
  // TODO: If returns a non-query result, cancel() and set to that value?
  // TODO: Checks for uniqueness, only once per location: TODO: What would a reduce look like that doesn't do this (could be useful for intermediate results) - is this useful?
  reduce: (callback: (accumulator: Node, current: Node, cancel: Node) => any, initial_value: any) => Node
  reduce_right: (callback: (accumulator: Node, current: Node, cancel: Node) => any, initial_value: any) => Node

  /**
   * @alias pop_front
   */
  shift: () => TSelf
  /**
   * @alias push_front
   */
  unshift: (...x: any[]) => TSelf
  /**
   * Set all nodes to a given value.
   */
  fill: (value: any) => TSelf
  index_of: (value: any) => Many<Node>
  /**
   * Note: that since variable lengths are possible, .length will return a number of possibilities.
   */
  length: () => Many<Node>
  /**
   * Counts the number of nodes.
   * Note: that since graph's structure allows for branching, it could be that .length.max() != .count.
   */
  count: () => Node
  max: () => Node // TODO: This number returns a node within the "number line". In a way that .gt works on it. Similarly, .first returns -Infinity.
  min: () => Node

  is_nonempty: () => Node
  is_empty: () => Node

  /**
   * Reverse direction starting from the selection
   */
  reverse: () => TSelf
  /**
   * Select all nodes at a specific index/range.
   * TODO Make sure negative index works
   * TODO (index: number | IRange): IRange | Ray => is_number(index) ? Range.Eq(index) : index
   *
   */
  at: (index: number | IRange) => Many<Node>
  /**
   * Maps the original structure to one where you find the distances at the Nodes.
   *
   * Note: This can include infinitely generating index options.
   */
  // TODO Map_reduce here.
  distance: () => TSelf
  /**
   * Ignores duplicates after visiting the first one.
   */
  unique: () => TSelf

  /**
   * Select all nodes in this structure
   */
  all: () => Many<Node>

  next: () => Many<Node>
  previous: () => Many<Node>
  /**
   * The terminal boundaries reachable from this selection.
   * Note: if you want ALL terminals, you should use .all().last
   */
  last: () => Many<Node>
  first: () => Many<Node>
  /**
   * Note: Plus and minus are simply moving the pointer along the graph a number of steps.
   */
  plus: (value: number | IRange) => Many<Node>
  minus: (value: number | IRange) => Many<Node>

  /**
   * Note: Having a possible next value doesn't mean that the current value isn't also terminal: It can be both.
   */
  has_next: () => Node
  has_previous: () => Node

  /**
   * Change the values of all selected nodes.
   */
  set: (value: any) => TSelf
  /**
   * Remove the selection from the underlying ray.
   * TODO: Default RemoveStrategy.PRESERVE_STRUCTURE
   */
  remove: (strategy?: RemoveStrategy) => TSelf
  pop_front: () => TSelf
  pop_back: () => TSelf
  /**
   * Push a value as a possible continuation. (Ignores the next node)
   * Note: In the case of an array, this will push "the structure of an array" after the selection. NOT a list of possibilities.
   */
  push: (...x: any[]) => TSelf
  /**
   * Push a value between the current and next node.
   */
  push_after: (...x: any[]) => TSelf
  /**
   * Push a value between the previous and current node
   */
  push_before: (...x: any[]) => TSelf
  push_back: (...x: any[]) => TSelf
  push_front: (...x: any[]) => TSelf


}

/**
 * TODO: Unselected structure: Ignored structure?
 *
 *
 * TODO Merging different references of the same value. (Deduplication)
 *      Different instantiations on the same . equals value, with unselected structure, switching to other unselected structure might be "all other references to this value" which we could have pending, without needing it to be instantiated when accessing the existing structure.
 * TODO
 *
 *
 *
 * TODO: A node is a selection of rays from a larger collection of rays at that node.?
 */
export interface Node extends Pointer<Node> {

  /**
   * TODO: "Equivalence frames" are deemed .equal
   * TODO: .equal/.isomorphic/.identical for which would you need to implement this?
   *
   * TODO: (Canonicalization) OR: Are all node references merged like this? Then what is the .self value? What happens with duplicated structure? etc..
   *       Might still want to remember the different representations/original nodes and access them.
   *       .identical, or different representations, works similarly here (with respect to merging different references (deduplication)).
   */
  // equivalence: (is_equivalent: (a, b) => boolean)) => TSelf

  /**
   * TODO: Move the "selected structure" to ".self"
   */
  // context: () => Node
  // self: () => Many<Node>

  /**
   * TODO: The existence of a loop VS an instantiation matching that loop.
   * TODO: Empty node vs ANY match. Something like "the result of .equals" is always true?
   *        similarly .or, result of .equals is A | B. Or .equals = false for A,B,C. So exclusion as well.
   *
   * TODO: Type here should also be something like a programming language specification.
   *       More generally; does this pattern match onto this Node/structure.
   *        Take some language spec like WASM (or Backus-Naur Form) and make that.
   *        Or regex as an example.
   *
   * TODO: Type matching like look ahead/look behind in regex. Generalized to ?
   *        In front .equals/.not some other structure, but result excludes this
   *        Atomic group something like .if(option A, .if(option B.))
   *        Generalization of this "program on x results to".
   *
   * TODO example: 2D-Grid How to make sure that there's a difference between "X goes to X" "Y goes to Y" vs just two dimensions at each point?
   *      Need a difference between "selected structure" and "referenced structure". I reference a point with two dimensions, but I only select one of the dimensions in that reference, which is our X/Y dimension.
   *      OR: Don't allow vertex -> vertex and go based of the initial/terminal referencing a particular ray/rays.
   *      + (difference between Infinite 2D grid vs finite 2D grid which have initial/terminals)
   *
   * TODO: Include type information like ().length.max().lt(2 ^ 32) (javascript Array) "result at this variable location"
   *
   * TODO for regex youd have something like {min,max} ().length().max() -> .lte(max), .gte(min) "Have some way to branch multiple queries unto one thing" is probably a repeating pattern we're going to use.
   *
   *
   * TODO: Difference between whole match, and a match where "at least the type" is in this object (matching subgraphs for instance).
   *        Subgraphs important: some looped variable say "A", matched .length().max() = 5 times, the length, should only count for that subgraph. Not additional things that might be defined further along the .next/.previous sides.
   *        Again this need for, "selected structure" being the underlying structure. Say the beginning and end of AAAA. And another being
   *        the reference to the loop around "A".
   *
   *
   * TODO: Subgraph isomorphism vs subgraph isomorphism + .equals on all the nodes.
   *       Subgraphs including/excluding initials/terminals.
   *
   * TODO: Requires: "On another level of description", like "this group"/"this subgraph".
   *
   * TODO: What does the type of an array look like? Is it a simple loop with an initial/terminal. But that also matches a branched structure, how to dismiss the branched structure?
   *
   * TODO: .or (set union), .and
   *
   *
   * TODO: Matched groups and referencing them, Mapping and using matched groups for some other purpose. For example mapping a string expressing regex to a similar pattern what the regex means.
   *      Mapping a grammar of a language and then compiling the language as an example. So some program follows here.
   *
   *
   * TODO: Mapped as some other function so it's a program.
   */
  instance_of: (type: any) => Node // instance_of: (self) => self.match(type).is_nonempty()
  //TODO Similar to .remove, this matches to a structure and returns that structure.
  //TODO This should also be possible to select a subgraph. So a Node, when not selecting anything, might not be the entire graph but a subgraph.
  match: (pattern: any) => Many<Node>

  /**
   * Equal in value (ignores structure).
   * TODO: Value might be Many<Node>, so value could be a (math) Set.?
   */
  equals: (value: any) => Node
  /**
   * Structurally equal (ignores value).
   * TODO: What about the additional structures defined at that node\?
   *  Is that always considered part of value or not?: No it's not. Consider for example some "times function" on top of the plus structure. We only want to consider the values.
   *
   * TODO: So, difference between isomorphic and isomorphic in all those structures?
   * TODO: Also, isomorphic of selected structures (for each dimension) vs as a combined dimension.
   *
   *
   * ROTATION/REFRAME?;
   * TODO: Calling it a rotation, what does a normal rotation look like in this setting?
   * TODO: Also some way to change the .value checked at .equals.
   * TODO: Need some way to join/select/merge structures
   */
  isomorphic: (value: any) => Node
  /**
   * Structure, and all values within that structure, are equal.
   */
  identical: (value: any) => Node

  // TODO: If-else and other language primitives
  //       If-else is simply an if branch in the _false value.
  // TODO: If-branch has a .next depending on the value, if value is a type, it's to both, if not. It goes to either the true/false branch.
  // TODO: Dynamic values here should be allowed
  // TODO: if in a control-flow would have a difference between the "if function as a node" and the "next step" as a result in this case.
  if: <True, False>(_true: True, _false?: False) => (True extends Pointer<infer _> ? True : Node) | (False extends Pointer<infer T> ? False : Node)

  /**
   * Greater than: does "value" come before this node.
   * TODO: What do to with the ambiguity of starting traversing from this, or value. It's probably an either on those two.
   */
  gt: (value: any) => Node
  gte: (value: any) => Node
  lt: (value: any) => Node
  lte: (value: any) => Node

  not: () => Node
  or: (b: boolean) => Node
  and: (b: boolean) => Node
  xor: (b: boolean) => Node
  nor: (b: boolean) => Node
  nand: (b: boolean) => Node
}

// TODO: When traversing, how to differentiate where in the structure you are, say .next results into two terminals, and a vertex.
//       That could recursively be the case at defining the terminals, how to keep track of which are the ones we're interested in
//       for the .next result.
export interface Ray extends Node {
  is_initial: () => Node
  is_terminal: () => Node
  is_reference: () => Node
  is_vertex: () => Node
  is_boundary: () => Node
}


/**
 * All methods on Node can also be applied to many Nodes in parallel.
 * TODO: Is this useful, when or just confusing?
 */
export type ParallelNodeMethods = {
  [P in Exclude<keyof Node, keyof Pointer<Node>>]: Node[P] extends (...args: infer Args) => infer TNextQuery
    ? (...args: Args) => Many<Node> : never
}
export type Many<T> = Pointer<Many<T>>
  & (T extends Node ? ParallelNodeMethods : {})


/**
 *
 * TODO FUNCTIONS
 *      - What does a function structurally look like, is there a nice visual translation possible?
 *      -
 *      -
 *      - Matched to some Type/Node predicate (parameters): "Could apply this function to this selected value".
 *        Generalized to: Like ANY match: Many<Node> whose "result of predicate = true"
 *      - "Many usages" -> as unselected structure
 *      - Function.equals(Function)
 *      - Function.equals(Function) = true (set as equivalent, rewrite function as another function)
 *          "Graph of equivalences reached through theorem prover, how"
 *          Possible rewrites as (what are the equivalences)
 *          Allow for self-reference of operators (but requires implementation).
 *      - Function.compose(Function) = Function (If functions are control-flow graphs, then function composition is linked to graph composition)
 *      - Control-flow & debugging
 *          Where in the control-flow is the program? (Many<Node> ref)
 *          Intermediate values of variables (like the .reduce accumulated value which may be non-halting)
 */
export interface Function {

}

/**
 * TODO: Traverser as additional structure on Node.
 * TODO: Things like: can only be traversed once in a particular traversal. (used for .slice/.splice, which has an .orbit, but only once for the range/start index).
 *       Is this common enough to add? What would this be generalized to?
 */

// TODO: TRAVERSAL
//      - Program strategy: which branches to take first.
//        + Program stepping.
//      - Cycle detection & merger
//      - Intermediate results while others are still pending.
//      - Support yielding initial/terminals as well. (intermediates which are still looking)
//      -
//      - Ideas of paths (subgraphs) (example: index_of vs path used to get there. -1, 1, 1, -1 etc.. REPLACE index_of with path_to(x), and then index with .distance and walk the path)
export class Traverser {


}

/**
 *
 *  TODO: Difference between "nothing selected at Node" and "selecting the entire Graph where .first enters the graph.
 *         Remember that we're at a terminal? Not that .next again returns the first element (empty != graph)
 */
export interface Graph extends Pointer<Graph> {
  // TODO: Can include disconnected pieces. Also should include a disconnected piece without an initial. and so no qualifier to .first.

  // TODO: PRESERVING ALL STRUCTURES AND HISTORIES
  //       How? Preserving both the original structure, and the rewritten graph.
  //       -> Ambiguous rewrites etc..
  //       -> Partial, without necessarily checking the entire graph.
  //            (what happens when a second rewrite is given, which a pending first rewrite might still cancel):
  //            (possible) Additional ambiguity of order of rewrite. What if invariant and doesn't matter?
  //
  // TODO: Split the graph at the differences?. Add/remove
  //       OR better: Give the ray from which we want to access this, which contains the remove/non-removed history.
  //



  // TODO: Rewrite with checking structure at nodes, or ignored. (Basically only looking at between structure)
  // rewrite: (lhs: Graph, rhs: Graph)
  // dpo, spo, cartesion product, tensor product, union, disjoint union etc...
  // compose matching domain/codomain

}


export default Ray;

/**
 * Range
 */
export interface IRange {
  or: (b: IRange) => IRange
  // and: (b: IRange) => IRange
  all: () => boolean
  contains: (x: number) => boolean
  more: (current: number, positive?: boolean) => boolean
  invert: () => IRange
}
export type Bound = { at: number, inclusive: boolean }
export class Range implements IRange {
  constructor(
    public lower: Bound,
    public upper: Bound,
  ) {
    if (lower.at > upper.at)
      throw new Error('Lower bound is greater than upper bound');
  }

  all = () => this.lower.at === -Infinity && this.upper.at === Infinity

  contains = (x: number): boolean => {
    return (this.lower === undefined || (this.lower.inclusive ? x >= this.lower.at : x > this.lower.at))
      && (this.upper === undefined || (this.upper.inclusive ? x <= this.upper.at : x < this.upper.at));
  }

  more = (current: number, positive: boolean = true) =>
    positive ? this.upper.at > current : this.lower.at < current

  or = (b: IRange): IRange => new MultiRange([this, b])

  invert = (): IRange => {
    if (this.all()) return new Range({ at: Infinity, inclusive: false }, { at: Infinity, inclusive: false });

    const ranges = []
    if (this.lower.at === -Infinity) ranges.push(new Range({ at: this.upper.at, inclusive: !this.upper.inclusive }, { at: Infinity, inclusive: true }));
    if (this.upper.at === Infinity) ranges.push(new Range({ at: -Infinity, inclusive: true }, { at: this.lower.at, inclusive: !this.lower.inclusive }));

    return ranges.length === 1 ? ranges[0] : new MultiRange(ranges)
  }

  public static Eq = (x: number) => new Range({ at: x, inclusive: true }, { at: x, inclusive: true })
  public static Gt = (x: number) => new Range({ at: x, inclusive: false }, { at: Infinity, inclusive: false })
  public static Gte = (x: number) => new Range({ at: x, inclusive: true }, { at: Infinity, inclusive: false })
  public static Lt = (x: number) => new Range({ at: -Infinity, inclusive: false }, { at: x, inclusive: false })
  public static Lte = (x: number) => new Range({ at: -Infinity, inclusive: false }, { at: x, inclusive: true })

  public static Between = (lower: number, upper: number) => new Range({ at: lower, inclusive: true }, { at: upper, inclusive: true })
}
export class MultiRange implements IRange {
  constructor(public ranges: IRange[] = []) {}

  all = (): boolean =>
    this.ranges.some(range => range.all());
  contains = (x: number): boolean =>
    this.ranges.some(range => range.contains(x));
  more = (current: number, positive: boolean = true): boolean =>
    this.ranges.some(range => range.more(current, positive));
  or = (b: IRange): IRange => new MultiRange([...this.ranges, ...(b instanceof MultiRange ? (b as MultiRange).ranges : [b])])

  invert = (): IRange => { throw new Error('Not implemented') }

}

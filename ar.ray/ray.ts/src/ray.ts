export type MaybeAsync<T> = T | Promise<T>

// TODO: Name Query or Program?
export namespace Query {
  export namespace Property {
    export type MappedValue<T> = T extends void ? void : T | Query.Type<Node>
    export type MappedParameterArguments<T> = { [Arg in keyof T]: T[Arg] extends Pointer<infer _> ? Query.Type<T[Arg]> : T[Arg] }
    export type MappedFunction<T extends (...args: any[]) => any> = T extends (...args: infer Args) => infer R ? (...args: MappedParameterArguments<Args>) => MaybeAsync<MappedValue<R>> : never;
    export type MappedArgument<T> = T extends (...args: any[]) =>
      any ? MappedFunction<T> :
        T extends Pointer<infer _> ? Query.Type<T> :
          MappedValue<T>
    export type MappedArguments<T> =
      0 extends (1 & T) /* T = any? */ ? [MappedArgument<T>] :
        T extends void ? [] :
          T extends any[] ? { [K in keyof T]: MappedArgument<T[K]> } :
            [MappedArgument<T>]

    export type Type<TValue, TNextQuery> = {
      (...value: MappedArguments<TValue>): Query.Type<TNextQuery>
      __name__: string | symbol
    }
  }

  export namespace Convertable {
    export type MappedValue<T> = MaybeAsync<undefined | T>

    export type Type = {
      to_number: () => MappedValue<number>
      to_boolean: () => MappedValue<boolean>
      to_array: <R>(map: (x: Query.Type<Node>) => MappedValue<R>) => MappedValue<R[]>
      to_function: () => MappedValue<(...args: any[]) => any>
      // TODO: Object is mostly a list of named structures, named being: additional structure on those structures.
      to_object: <T = object>(constructor?: new () => T) => MappedValue<T>
      to_string: () => MappedValue<string>
      to_map: <K, V>(key: (x: Query.Type<Node>) => MappedValue<K>, value: (x: Query.Type<Node>) => MappedValue<V>) => MappedValue<Map<K, V>>
    }
  }

  export type Type<T> = {
    [P in keyof T]: T[P] extends (...args: infer Args) => infer Query ? Property.Type<Args, Query> : never
  } & {
    new (...args: any[]): Query.Type<Node>
    (): Instance
  } & (T extends Node ? AsyncIterable<Query.Type<Many<T>>> & Convertable.Type : {})

  export const instance = <T>(): Type<T> => new Instance().__proxy__ as Query.Type<T>

  export class Instance {

    // TODO: Construct a ray instead of using __parent__ here.
    __parent__?: Instance
    __property__: string | symbol
    __value__?: any

    __get__ = (property: string | symbol): any => {
        const __property__ = <TValue, TNextQuery>(...value: Property.MappedArguments<TValue>): TNextQuery => {
          const x = new Instance();
          x.__parent__ = this;
          x.__property__ = property;
          x.__value__ = value;
          return x.__proxy__ as TNextQuery;
        }
        __property__.__name__ = property;
        return __property__;
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
      construct: (_: any, argArray: any[], newTarget: any): object => this.__construct__(...argArray),
      // deleteProperty: (_: any, property: string | symbol): boolean => this.__delete__(property)
    }) }

  }

  /**
   * TODO Some function on Query effecting all downstream children VS having a pointer to the original structure.
   *    Or when would you use some more complicated "these kinds of changes but not others".
   *    Access the chain similarly graph.last. But that means it can branch so which to pick? Or are all changes in some required sequence ... (Either both) In case a JavaScript object it's in some required sequence.
   *      OR we could execute whatever we do on a node to all possible futures.
   *      Which means a pointer is a selection and a possible number of future possibilities. How does that effect things; to_x might change.
   */


  /**
   * TODO
   *  - Named subgraph
   *        (or: a node with name x, gets replaced with graph y)
   *        TODO: Patterned rewrite vec(A) ::= A^n
   */


    // TODO: Requires knowledge of what operation can effect what.
  // TODO: Could figure out what can be done in parallel and what can't.
  // TODO: Say I used push_back somewhere and I question .last right after. It becomes: .last before is no longer relevant. "If there is a terminal, so push_back has a target, then it is that value there.)

  // TODO: CACHE / STATE
  //       Cache results in between for some runtime library.
  // 		    - Invalidate before some query, caching on some other base layer

  // TODO
  // TODO Merging different references of the same value. (Deduplication)\ Split off if value changes.
  //      Have pending possible switches to (un)selected structure. Many refs to the same value
  export class Executor<T> { //TODO: Rename to Runtime/Compiler?

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


    // TODO: Translate high-level "Query language" to a bunch of .next operations (function application) and context switching (function selection)
    //       Context-switching needs some generalized way to speak about 'possible functions to apply' -> Something more general than just unique function names

    // TODO: If to_[boolean] is called and awaited throw if program isn't used.
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
  group: (x: (self: TSelf) => any) => TSelf

  every: (predicate: (x: Node) => boolean) => Node
  some: (predicate: (x: Node) => boolean) => Node
  contains: (value: any) => Node

  map: (predicate: (x: Node) => any) => TSelf
  /**
   *
   * Note: If a node is currently selected and falls outside the filter, the node will be deselected.
   * TODO: Other things than index here as related to the traverser? Or just put the traverser there
   */
  filter: (predicate: (x: Node, index: Node) => boolean) => TSelf
  /**
   * Opposite of 'filter'.
   */
  exclude: (predicate: (x: Node) => boolean) => TSelf
  // TODO: If returns a non-query result, cancel() and set to that value? "assume static value, not a program"
  // TODO: Checks for uniqueness, only once per location: TODO: What would a reduce look like that doesn't do this (could be useful for intermediate results) - is this useful?
  reduce: (callback: (accumulator: Node, current: Node, cancel: Node) => any, initial_value: any) => Node
  reduce_right: (callback: (accumulator: Node, current: Node, cancel: Node) => any, initial_value: any) => Node

  // TODO Combine arbitrary iterators like map, reduce, or "with/by_index" and other things like it.
  // map_reduce

  step_by: (value: number) => TSelf
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
  /**
   * Returns the largest value according to some "number line" (; or rather, some ordering).
   * TODO: How to select which numberline. Which currently doesnt work for .max/.min.
   *
   * TODO: Should be possibly Many<Node> because of loops "1" and "2" can both be greater than each other.
   */
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
  at: (...index: (number | IRange)[]) => Many<Node>
  /**
   * Move the current VALUE to other nodes in the graph.
   * TODO: What to do if there are multiple values at a Node? Just overlay them? Or would you want additional structure deciding with pairs of rays at .self belong to eachother?
   */
  move: (...index: (number | IRange | Path)[]) => Many<Node>
  /**
   * Maps the original structure to one where you find the distances at the Nodes.
   *
   * Note: This can include infinitely generating index options.
   */
  // TODO Map_reduce (but then for each path) here.
  distance: () => TSelf
  /**
   * Ignores duplicates after visiting the first one.
   * TODO: Does uniqueness check for SELECTED STRUCTURE or not? In the case of is_unique for is_injective you'd think so
   */
  unique: () => TSelf
  /**
   * TODO: map reduce first, first.at(0, index).excludes
   * Graph -> Set: graph.equip(graph => graph.unordered.unique).
   */
  unordered: () => TSelf

  /**
   * TODO: Two .nots might not be invertible. If you define it as "go to everything not here", "then come back", the second step might fail or have additional results.
   */
  // not: complement of a graph where the universal set is the entire graph.
  // or: union
  // and: intersection
  // xor: symmetric_difference

  not: () => TSelf // TODO: Node -> Many<Node> if we're not evaluating

  /**
   * Note: Plus and minus are simply moving the pointer along the graph a number of steps.
   * TODO: Plus 3 | 5 - 3.OR(5)
   */
  plus: (...value: (number | IRange)[]) => Many<Node>
  minus: (...value: (number | IRange)[]) => Many<Node>
  plus_minus: (...value: (number | IRange)[]) => Many<Node>

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

export interface Node extends Pointer<Node> {

  /**
   * TODO: "Equivalence frames" are deemed .equal (.equal/.isomorphic/.identical)
   *       What would it mean to equivalence over a time period to a certain structure?
   *
   * TODO: All nodes in some program are added to some larger Graph, that graph has operations on it like .map
   *          OR altered .equals (.rewrite?).
   * TODO: - All nodes: All different selected contexts of a particular Node.
   * TODO: - (.filter) All VALUEs in some subgraph are deemed equivalent.
   * TODO: - Are deemed equivalent in some context. (Which selected context of that node instance)
   *       - How to access representation before canonicalization? (When?)
   *
   * TODO
   *    - .equivalence which merges all SELECTED CONTEXT.
   *    -
   *
   * Equivalence through a canonicalization function:
   * .apply(graph.filter(x => temperature(x) > 10).map(x => canonicalize(x)))
   * Forced equivalence through ignorance:
   * .apply(graph.filter(x => temperature(x) > 10).equivalent())
   *
   * TODO: HOW TO
   * rewrite(self => self.equals(any of [self.GRAPH]), true)
   */
  equivalent: () => Operation
  // rewrite: <TProperty>(property: (self: Node) => TProperty, value: any) => Node

  /**
   * TODO: How to visualize a type properly/intuitively?
   *
   * TODO: Equivalence of types used for ?
   *        -> Every .next from first to last is equivalent. so things like -B-B- and -B-|-B- are equivalent (-B- OR -B-), -B-
   *                                                                                  -B-| (<-- structure is .OR on boundary)
   *                                                                                  (In this case one needs to look ahead to check for merges instead of directly comparing each .next)
   *
   * TODO: The existence of a loop VS an instantiation matching that loop.
   *       How to: a particular complicated loop max X times.
   *       - Select subgraph which is the loop, then: ???
   *       - Have a named reference to that complicated loop, and have a simple loop, then .length().max() on that simple loop.
   *       - [unrolled].length.max() <= .length().max() of subgraph * X
   *            - if (loop exists) .unrolled() on any place within that loop.
   *
   * TODO:  |-> Object as a type is a list of KV pairs, so type is a loop of KV pairs, where that loop is on the context equivalency ray.
   *
   * TODO: In the example of varargs, it's a match to zero-length: So a terminal, or the loop with entries. So a type difference is a match to any
   *       subpath available in the structure vs having all subpaths.
   *
   * TODO subgraph would be: (pattern match like any type)
   *          - ANY additional matches on any Node/continuation. (in the usual graph sense only continuations, on nodes would be additional overlapping graphs)
   *          - Tag outer/subgraph with a name?.
   *       - any[] would be, ANY additional matches on the structure (or in javascript case the type any) that's the node.
   *
   * TODO: Type matching like look ahead/look behind in regex. Generalized to ? (Subgraph .look - not matching the result)
   *
   * TODO example: 2D-Grid How to make sure that there's a difference between "X goes to X" "Y goes to Y" vs just two dimensions at each point?
   *      Need a difference between "selected structure" and "referenced structure". I reference a point with two dimensions, but I only select one of the dimensions in that reference, which is our X/Y dimension.
   *      OR: Don't allow vertex -> vertex and go based of the initial/terminal referencing a particular ray/rays.
   *      + (difference between Infinite 2D grid vs finite 2D grid which have initial/terminals)
   *        |-> Requires rethinking, what decides which context gets selected on travelling there.
   *
   * TODO: Include type information like ().length.max().lt(2 ^ 32) (javascript Array) "result at this variable location"
   *
   *
   * TODO: Matched groups and referencing them, Mapping and using matched groups for some other purpose. For example mapping a string expressing regex to a similar pattern what the regex means.
   *      Mapping a grammar of a language and then compiling the language as an example. So some program follows here.
   *
   *
   * TODO: Enumeration of instances of some type, though often there wouldn't be an implementation, and how is the ordering/traversal of options done properly? When is this useful?
   */
  instance_of: (type: any) => Node // instance_of: (self) => self.match(type).is_nonempty()
  //TODO Similar to .remove, this matches to a structure and returns that structure.
  //TODO This should also be possible to select a subgraph. So a Node, when not selecting anything, might not be the entire graph but a subgraph.
  // TODO How is a subgraph match done?
  match: (pattern: any) => Many<Node>

  /**
   * Whether this is the only occurrence its VALUE
   * TODO: Include looped-on values? VS ignore looped-on values
   * TODO: Not to be confused with mathematical uniqueness: x.selection().length().equals(1)
   */
  is_unique: () => boolean

  // TODO: Or is rotation a good name?
  // reframe: (x: (context: Context) => Context) => Node

  mod: (value: number) => Node

}

/**
 * Edge reference (which is at least a terminal/initial if not dangling?)
 *
 * TODO:
 *    - The combination of "initial" and "terminal" -> "make an edge", then select is as a Node, then put a direction on that subgraph which is the edge. to describe the relation.
 *    -
 *    - Different types of edges (from some enumeration?)
 *    - Structure on edges like values, weights, probabilities etc..
 *        -> How do these effect .next, or shouldn't they? And are we missing some fundamental concept here? (As in not everything is reducible to context switching and .next's)
 */
export interface Edge {}

// TODO: Could be infinite context here
/**
 * TODO Change: Ignored Structure:    Ignored Context (does this need to have structure like .history, .functions, .traversers, .referenced_by .? )
 *              Selected Structure:   Context,  (used for types and referencing structure other than Referenced Structure: .equivalent in this structure not referenced)
 *              Referenced Structure: Space / Referenced Context,   .isomorphic / .next
 *              Value.
 *
 * TODO: Should selection change too? Yes? + Edges on selection
 *
 * TODO History
 *      Context changes need to be in the history.
 *
 *
 *
 * TODO Rethinking
 *      Current:
 *      - Every entry is on an equivalency ray. "All these are deemed equivalent'
 *        -> The graph that defines them is the Node.
 *            -> What happens to all the selected context/ignored structure/referenced structure on each of the nodes? It is all included? But ignored by default?
 *                -> What determines what is selected/ignored/referenced etc..?
 *                    Different cursors within that structure?
 *        -> Each selection of contexts similarly is deemed a different Node "sub-Nodes" of some "original Node".
 *      Requirements:
 *      - Conceptualization of Time/Dynamics:
 *        What does a program look like in traversal terms?
 *          - Control-flow + a cursor with variables
 *          - Rewrite rule match
 *          - Some general way to convert control-flow-like to a rewrite rule? Gives you some calculus
 *        Generalized we rephrase all of the above as:
 *          - Some cursor in some graph
 *          - ?? (Some way to traverse and search the graph / Some way to read instructions on what to do at location)
 *                |-> Context switching & .next (MOVE instructions),  |-> ALTER instructions would be????
 *                    - (What about complicated edges????)
 *                    - Context switching is just a MOVE inside the context equivalency ray. But how?
 *                |-> Many cursors, each with separate list of instructions?
 *          -
 *      - Cursor might carry structure with it.
 *      - "If condition is met" - add functionality; aka context. In what order? Do we recheck after? (Allow for infinite regress?)
 *      - Names for different types of selection: Reference node (only .self) and ray (direction) separately, ray if some direction is selected. What about other selections, single selection (single ray: Context?) etc..
 *        - Node: no context selected, Ray: context selected.
 *      -
 *      -
 *      - Graph.equals compared the whole structure as if moving context to .self like A-B-C taking -B-.context, moves A-B-C to .self at -B-, then -B-.context.equals(A-B-C) is what you expect. -B-.equals(B) -B-.context.equals(A-B-C)
 *      -
 *      - Ray is many selected contexts, isomorphism checks that the set/list of the selected contexts are equal
 *          Example: 2D-grid, one of the rays goes to another points, at which both the x/y coordinate is selected. So .next would go to either x/y coordinate, if undirected to -x/x/-y/y
 *          So what's the benefit between having multiple selected contexts vs always merged into one?
 *      - Selected context might each have separate values, how do those stack to .value?
 *        Say A-S-D intersected with H-J-K-L at -S- & -J-, each row has separate value: -S- and -J-.
 *          -> If we XOR(-S-, -J-), then the resulting value is also XOR(S, J)
 *          -> Are there additional values on both of them? Yes. Say an additional binary 0/1 on both.
 *      - How to choose what context to select?/deselect?
 *      - Maybe have one of the selected contexts be highlighted in the sense of "came from here".
 *      - .next because of conditional structures should return things like XOR(A, B)
 *      New:
 *      - If .self is often called because we dont care about the directionality. We could have default behavior be .self, and
 *        a special character be, retain information of the graph you were just in. Like array[0] is .self, array[0]~ is the ray [0-]1-2
 *      -
 *
 */
export interface Context {

}
export interface Reference {

}
export interface Operation {

}

// TODO: When traversing, how to differentiate where in the structure you are, say .next results into two terminals, and a vertex.
//       That could recursively be the case at defining the terminals, how to keep track of which are the ones we're interested in
//       for the .next result.
// TODO: Select substructure of the structure on the edges as a path.
// TODO: Ray + Ray => Ray
// (exec as any as Query.Executor<Ray>).rewrite({
//   is_initial: (self) => self.initial().is_empty(),
//   is_terminal: (self) => self.terminal().is_empty(),
//   is_reference: (self) => self.is_initial().and(self.is_terminal()),
//   is_vertex: (self) => self.is_initial().not().and(self.is_terminal().not()),
//   is_boundary: (self) => self.is_initial().xor(self.is_terminal())
// });
// export interface Ray {
//   initial: () => Many<Node>
//   terminal: () => Many<Node>
//
//   is_initial: () => Node
//   is_terminal: () => Node
//   is_reference: () => Node
//   is_vertex: () => Node
//   is_boundary: () => Node
// }


export type Type<T> = T & {
  matches: (predicate: (x: T) => boolean) => Type<T>
};

/**
 * TODO: Editor
 *       How to differentiate between domain names and function calls/variable references !orbitmines.com? Not @, use that for players. # for chat rooms
 *
 * TODO  Should be a text-only variant which still is decently usable? But how?
 *       possible option: Using named references when structures are too complicated to display?
 *
 * TODO: Drawing graphs, drawing numbers/letters/symbols in the ide, embedded in the 2d grid then subgraphs of glyphs being linked together in another layer.
 *
 * TODO  - It should be definable what counts as possible function/property continuations. Different programming languages do things differently
 *       Take for instance a function that's applicable to all of a certain type. Or only within the scope or some object.
 *
 * TODO FUNCTIONS
 *      - Does there exist a better abstraction than functions?
 *      -
 *      - What does a function structurally look like, is there a nice visual translation possible?
 *        (Substructure of a larger graph?, layered in a particular way) + Control-flow/Code graph
 *      -
 *      - For things like functions, "accepts type X" but only really uses subtype "Y". So either allow subtype Y, or force that entire X type.
 *      -
 *      - Structured input/outputs is basically: Reset everything to a single parameter, but allow one to tag names to arbitrary parts
 *                                               of its structure. "What is the actual problem parameters are trying to solve: attaching names to structure"
 *      - Structured inputs ; not a single parameter which is a 2d grid, but something novel like a 2Dgrid of parameters
 *          Can do things like varargs: a, b, ...c Or other things like ...a, b, c. Or: first, ...middle, last.
 *          Or 2dgrid:
 *            A0 A1 A2                       A0, ...A, AN               A0
 *            B0 B1 B2    OR things like     B0, ...B, BN        OR     B0 - subgraph: SUBGRAPH (single name matching a graph)
 *            C0 C1 C2                       C0, ...C, CN               C0
 *                                                                            SUBGRAPH: B1, B2, ...B, BN
 *      - Similarly structured outputs
 *            first, ...middle, .last = func_call()
 *          Or 2d grid:
 *            A0, ...A, AN                      A0, ...A, AN                                                      fA()
 *            B0, ...B, BN     = func_call()    B0, ...B, BN  = f0(), f1(), f2(), f3(), fn()     (OR vertical): = fB()    (OR other structures)
 *            C0, ...C, CN                      C0, ...C, CN                                                      fC()
 *      -                                                          |-> commas here are .push_back?
 *      - And allow .equals with some structure matched to arbitrary ordering of names.
 *      - What if we have ambiguity in the matched pattern: a, ...b, ...c, d, or something where the last element is either something or nothing (Nothing needs to be supported).
 *          -> Branch all different combinations, or within the function have access to the different instantiations, how would one filter for a particular one?
 *             -> The distinct possibility combinations should be linkable (somehow recover the one from the other).
 *      - Similar to ambiguity in matched pattern, ambiguity in naming: Type match a particular name to two different parts of the structure. From there you can deduce from
 *        surroundings which one it is, but allow for that overlap.
 *      - Inputs/Outputs like "possible numbers" 3, 5, 7: or something like prime numbers. [see Types]
 *      -
 *      - What would be native things loops would be used for?
 *      - What about function/property names which are arbitrary structure.
 *          A.B
 *          [Structure A] . [Structure B]
 *          The way this works is tightly connected to how Contexts & selecting them will eventually work. As .B is just selecting a different context.
 *      -
 *      - Are basically .match(type) -> do/have these things
 *        But possibly only the matches within this graph X. (scopes)
 *      -
 *      - Always comes with: .next value is reapplying function to the same result. (Applying a single rewrite rule for example is a single path, which could branch in many different places it could be applied)
 *      - f' or the reverse starts at the terminal behind the result. One relies on caching or a reversible function to go back. (Or a non-reversible function where going back iterates a number of possibilities)
 *      -
 *      - Matched to some Type/Node predicate (parameters): "Could apply this function to this selected value".
 *        Generalized to: Like ANY match: Many<Node> whose "result of predicate = true"
 *            - Could be: "at least this structure (subgraph)" or other type checks.
 *      - "Many usages" -> as unselected structure
 *        Usages, gives a notion of time. In the sense of certain applications being in front of others, if they share some graph.
 *          -> Either have some global graph to keep track of this, or be set with partial notions of time
 *      - Function.equals(Function)
 *        Equality in input -> output (Extensional Equality)
 *          Partial equality OR Temporal equality of all "usages" so far.
 *        Equality in source code (Intensional Equality)
 *          When there are multiple implementations, what happens?
 *          More elaborate intensional equality would be?
 *            Definition (+ Different contexts in which the definition finds itself)
 *            Separate compilation layers it goes through
 *            (and some possible unknown compilation layers (ex. physics))
 *            "(perceived) Actual execution layer"
 *          VS control-flow at each layer
 *      - Function.equals(Function) = true (set as equivalent, rewrite function as another function)
 *          "Graph of equivalences reached through theorem prover, how"
 *          Possible rewrites as (what are the equivalences)
 *          Allow for self-reference of operators (but requires implementation).
 *      - Function.compose(Function) = Function (If functions are control-flow graphs, then function composition is linked to graph composition)
 *      - Control-flow & debugging
 *          Branching control-flow in editor & merge results into a single structure, what does that structure look like?.
 *            Or have things that start branches, but which are not used for results, so the function can terminate while having spawned a "thread" of sorts.
 *            -> Each branch has the option to [JOIN RESULT] as a return. Or the reverse, explicitly to [SEVER FROM RESULT] (This on branch, or on return?, return is more general probably.)
 *            -> Or just joinable to wait for both threads, without combining result.
 *            Is the result always a list of possibilities? Or would there be a case for joining the results into some other structure? Or: "If one finishes but not the other do this other thing"
 *          Variable is .history().last() ?
 *          Where in the control-flow is the program? (Many<Node> ref)
 *          Intermediate values of variables (like the .reduce accumulated value which may be non-halting)
 *          Normal programs have a control flow and location as opposed to a graph rewrite applying everywhere. Some generalization of these sorts of options
 *          What would the "branch from here" look like in the IDE? More generally what would it look like?
 *          - Be able to combine different types of control-flow/program evaluation paradigms; and specify what kind; Functional/imperative/rewrite rule/etc..
 *      - is_injective:
 *          (x) => func(x)
 *                  |--> [ALL].[SELECTION].has_unique_elements() .every(x => x.is_unique())
 *                  (Some way to select the entire codomain)
 *                      Function.image subset of Function.codomain
 *                      Function.image = Function.domain.next (Doesnt work because codomain is a constraint, not the actual output)
 *                      Function.domain = (Many<Node> with ref on function application)
 *          for_each (x) => func(x)
 *                            |-- .length == 1
 *                            (Some way to say that it only maps to a distinct element)
 *      - "What is effected" notion for functions. So not necessarily arbitrary returns etc.. So that there's a conceptual difference between a function which
 *        returns something arbitrary, and one which only changes the input.
 *          - In the case of a subgraph, with matching ANY placeholders around for the graph it's in. You'd want the ability to say: "We only touch the subgraph" or "only this thing".
 *
 * TODO: Implemented functions, bound to some keybinding?
 *      - Pattern like a loop with a length constraint, expand till constraints are no longer satisfied
 *          |-> Applied as a function, to some keybind "per step" or "all the way / pending infinity"
 */
export interface Function {
  // TODO Some way to at runtime access variables.
  //      What about delegated functions, how to point to the right function easily?
  variables: () => FunctionVariables

  /**
   * Returns a (partial) "sub-function" of the more general function. Where domain/codomain/.../is_injective is based
   * off of remembered usages of this function.
   * TODO: Better name than usages?
   */
  usages: () => Function

  domain: () => Many<Node>
  image: () => Many<Node>
  codomain: () => Many<Node>

  is_injective: () => Node
  is_surjective: () => Node
  is_bijective: () => Node

  is_homomorphism: () => Node
  is_isomorphism: () => Node
  is_endomorphism: () => Node
  is_automorphism: () => Node
  is_monomorphism: () => Node
}
export type Mapping = Function; // TODO Difference between func and mapping or not?

// TODO: Do these need to be explicitly exposed, and same with delegated ones, re-expose those in a function?
// TODO: Exposed variables at different compilation/execution layers (When used, would place additional dependency for that particular function, not only executable, but executable "in this particular way"; or at least with those additional constraints)
export type FunctionVariables = {
  [K in keyof any]: () => Node
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
 * TODO: Normal graphs, hypergraphs like Chyp, hypergraphs like Wolfram Physics (overlapping structures, which make the .next go to any place on the edge not where it came from)(
 *                                                                |-> Hypergraph definition mapped to the structure it's talking about.
 *       Or: System where .previous and .next are not the same as in a usual undirected hypergraph: A dynamic undirected hypergraph
 *
 *
 * TODO Causal Graph,
 *    Causal graph is the what effected what
 *      Causal graph of the causal graph ...
 *    - Causal graph needs a notion of what structure changed, could be that it didn't touch the graph but only the value. Do you want to have it still be a causal link created there if the graph for example isn't effected
 *
 *
 * TODO: Find subgraph with two disconnected pieces should be supported.
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
  //          |-> Can include something like: remember what/how much references this. If nothing does, discard it possibly/dont separately store it.
  //



  // TODO: Rewrite with checking structure at nodes, or ignored. (Basically only looking at between structure)
  // TODO: Equivalences between nodes in lhs/rhs here how? So you have things like variable rewrites (v, w) -> (w, z)
  // rewrite: (lhs: Graph, rhs: Graph) -> Returns many possible rewritten graphs: Many<Graph>
  //          ; Or if we have some specific updating order/traversing strategy; Graph
  //          ; More elaborate things than just a "rewrite", generalized to how functions normally operate. Where traversal/control-flow take part in what is decided to be updated.
  // dpo, spo, cartesion product, tensor product, union, disjoint union etc...
  // compose matching domain/codomain

}
export interface Path extends Graph {

}

/**
 * TODO: .ray <head> <version> (id, ...)[]
 */

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


/**
 * A node is a structureless point. "Structureless" in the sense that no structure is selected as context, and we can't
 * traverse its value, even though it has one. (But we can interact with it, minimally)
 */
export interface INode {
  // TODO: All methods called here are on the value, so .neg is different compared to abstract directionality .neg.

  // TODO: Cast down to node without anything selected, vs ray which we ignore as Node (usual way interfaces work)

  //TODO: value: One or many: Ray (with (many) selected contexts) or conditional ray (-B-.OR(-A-)) or graph or conditional graph A-B-C.OR(D-E-F), .first() -> A-.OR(D-)
  //TODO get/set allow to also get/set methods which are on node etc.., but they dont set default behavior of that method
  //TODO Is any match: NOTHING.NOT()

  //TODO Want NOTHING.OR(-B-) so that things like a conditional graph, can have values like first() -> which are (A1|B1, A2|B2, NOTHING|B3)\

  // TODO: Many<> is infinitely generating, so we'd like to use the ray structure for it.
  //       So we'd like to encode things like .OR() .AND() on the edges?
  //       - But we'd have intersecting programs, not just one world-line. Things Like
  //            -A-|
  //               |-C-         (-A-.OR(-B-)).AND(-C-) - if the same edge is used to connect all 3.
  //            -B-|            We could also have things like -A-.AND(-C-) & -B-.AND(-C-)
  //                            -> We use OR in that case? ( -A-.AND(-C-) ).OR( -B-.AND(-C-) )
  //       - How is grouping done?: -A-(-B-C-)-D-   (-A-.OR(-B-.AND(-C-)).OR(-D-))
  //          Naively, use tagging for substructures.
  //          How to do it natively? Allow grouping by default. How?
  //          - Could say that a single node -C-, encodes a separate group -D-(-E-.OR(-F-)
  //             -A-|   |-E-
  //                |-D-|
  //             -B-|   |-F-
  //            Allow terminals which don't match to the -C-'s terminal, like this:
  //             -A-|   |-E-  (|
  //                |-D-|     (|-H-)
  //             -B-|   |-F-  (|
  //                    |
  //                    |-G-| (<-- Terminal at G, so it wouldn't connect to a hypothetical -H-)

  //

  // TODO !!
  // TODO: Many<> should allow for conditional on entries of the graph.
  // TODO:   - Many<> acts just like a Node, but we remember it's many. So both Node and Many<> hold a program like A.OR(B)
  //
  // TODO It does like this: .next(): [A.AND(B), [C], D.OR(E)] -> A, B, C, D.OR(E)
  // TODO   -> That should'nt flatten .value; [-E-.AND(-F-), -G-]; would .next(): [ -E-.AND(-F-).AND(-G-), H, I ]
  //           So not -E-, -F-, -G-, H, I.
  // TODO   -> What should .parts return in -A-.OR(-B-) ; -A- & -B- ?
  // TODO   .all() -> -A-.OR(-B-).OR(-C-) -> Use this as a Many<> cursor.
  // TODO    Want to allow things like -A-.OR(MANY<-B-, Node<-C-, -D->>).OR(-E-) -> -A-.OR(-B-.OR([-C-, -D-])).OR(-E-)
  //          -> Node shouldnt be collapsed like Many would be. (or never nested)

  //TODO    + Types
  //           - Do types only match to ungrouped variants (so .expand()ed rays) Or how would we specify?
  //                                                           .expand_all() -> Might be self-referential, but we can still point to it.
  //           - Type information on equivalence ray. .loop continuations for Tree/Graph. .loop on KV pairs for Object.
  //TODO THEN: Edges and edge selection how does it work?
  //TODO    - Isomorphism should check edge types/structure.
  //TODO    - .next() on edge should return next edge?
  //TODO THEN: Forced equivalence
  //TODO Execution layer: Simplifications of graph expectations leading to different algorithms. For example .first() in a graph, not having to traverse the whole graph first to check all possible initials.

  /**
   * Node: Equal in value (there is no structure).
   * Ray/Graph: Structure, and all values within that structure, are equal.
   */
  equals: (value: any) => Node

  instance_of: (type: any) => Node
  match: <T>(pattern: T) => T extends INode ? Many<T> : Node

}

export interface Node extends INode, ConditionalStructure<Node> {}

export interface AbstractDirectionality<TSelf extends AbstractDirectionality<TSelf, TNode>, TNode = TSelf> {
  /**
   * Structurally equal (ignores value).
   */
  isomorphic: (value: any) => Node

  /**
   * Select all nodes in this structure
   */
  all: () => Many<TNode>
  // /**
  //  * Select all nodes, except for the ones in the selection.
  //  * "Complement, where the entire graph is the universal set"
  //  * TODO: Not on graph, but on Many
  //  */
  // complement: () => Many<TNode>

  next: () => Many<TNode>
  previous: () => Many<TNode>
  /**
   * Graph: The terminal boundary.
   * Ray: The terminal boundaries reachable from this selection.
   */
  last: () => Many<TNode>
  first: () => Many<TNode>

  /**
   * has_next/has_previous: Having a possible next value doesn't mean that the current value isn't also terminal: It can
   *                        be both. (There can be a 'terminal edge' after the node.)
   * is_last/is_first:      The converse is true, it can be last (so terminal), but still have a next value.
   */
  has_next: () => Node
  has_previous: () => Node
  is_last: () => Node
  is_first: () => Node

  /**
   * Convert to a subgraph type.
   *   TODO - ANY additional matches on any Node/continuation. (in the usual graph sense only continuations, on nodes would be additional overlapping graphs)
   *        - Tag outer/subgraph with a name?.
   */
  as_subgraph: () => TSelf

  /**
   * Returns a subgraph with all possible paths to X.
   * TODO: In something like a dynamical space, the previous locations might have changed or no longer exist: So it needs
   *       references to past structure. So each step in the path might be inside a different graph.
   *       This requires a new primitive. ; The original structure might change while this is still being performed.
   *                                            |-> Could choose to allow access to the original structure before changes.
   *                                            |-> Or allow changes.
   *       -> .next() or .previous() deviates from the graph because of temporal events.
   *       -> Still want a reference to both the existing graph from that perspective, as the path through time to get there.
   */
  path_to: (x: any) => Graph
}

export interface ConditionalStructure<TSelf extends ConditionalStructure<TSelf>> {
  // TODO: .NOT (LOOKAHEAD/BEHIND) (+ SUBSTRUCTURE - is achieved by collapsing/expanding) (.not on edges)
  not: () => TSelf

  or: <B>(b: B) => B extends TSelf ? TSelf : Node
  and: <B>(b: B) => B extends TSelf ? TSelf : Node
  // xor: <B>(b: B) => B extends TSelf ? TSelf : Node
  // nor: <B>(b: B) => B extends TSelf ? TSelf : Node
  // nand: <B>(b: B) => B extends TSelf ? TSelf : Node

  // TODO: A-B-C, D-E-F, (bool).if(-B-, -E-).next() = (bool).if(-C-, -F-) -> -C-.OR(-F-)
  if: <True, False>(_true: True, _false?: False) => True extends False ? False extends True ? True : Node : Node

  // TODO, Conditionally add structure, is there some other way of doing this better?
  // TODO: Include type information like ().length.max().lt(2 ^ 32)
  // TODO: Sequential order, or parallel by default if there's no dependence.
  // TODO:  In the interface one could collapse the conditionals down to a single line with some string as summary. (If it's multiline)
  conditionally: <B>(_if: (self: TSelf) => Node, _true?: (self: TSelf) => B, _false?: (self: TSelf) => B) => B extends TSelf ? TSelf : Node

  // /**
  //  * Enumerate instances of some type. TODO When would this be used?
  //  * Could be that there's no implementation or the default one is not as intelligent.
  //  * TODO Allow overriding this
  //  */
  // enumerate: () => Many<TSelf>
}

/**
 * A graph has abstract directionality, but there is no sense of "we're here at this point inside the graph".
 *
 * Any Node within this graph, is by default a Ray equipped with this graph as its "selected directionality".
 */
export interface Graph<TNode = Ray> extends INode, Collapsable, ConditionalStructure<Graph<TNode>>, AbstractDirectionality<Graph<TNode>, TNode> {

  /**
   * Tag any arbitrary part of this structure with a "name".
   * This is for example how function parameters get their names.
   *
   * To tag anything matching some type use .tag(tag, graph.match(type))
   * TODO: This is just additional context on this structure. (applicable to Node - same as equivalence ray)
   * TODO: Also add to Node: substructures of certain contexts have certain names. Say x/y axis.
   * TODO: How to get relative tags to the one taken.
   * TODO: If substructure changes, keep the name there? How to signal to the editor that certain new things are included/excluded here?
   * TODO: History of tags
   */
  set: (tag: any, substructure: any) => void // TODO Graph & { [tag]: substructure }
  get: (tag: any) => Many<Node> //TODO: .ONE_OF if multiple.

}

export interface Collapsable {
  /**
   * Graph; Collapse the entire graph to a single Ray, where .first() is initial, and .last() is terminal.
   * Many<Ray>; Collapse the subgraph to a single Node within the larger graph.
   * TODO: Should only be applicable to a collapsable subgraph (Could also allow arbitrary collapses: But that would require many rays to be instantiated, and some knowledge of what connects to what. Many intersections with this new collapsed node.)
   * TODO: Example where we collapse a complicated loop into a simple one?
   */
  collapse: () => Ray
}

// TODO Dynamically assign to loops
export interface Loop extends Many<Ray> {
  /**
   * A type pointer to the result of an unrolled loop.
   */
  unrolled: () => Many<Ray>
  /**
   * Modular unroll: after unrolling a loop still exists between the first and last instantiation.
   */
  unrolled_mod: () => Many<Ray>
  /**
   * TODO: This doesn't work if repeats allow infinite structure:
   *       .unrolled().length.max() <= .without_upper_loop().length().max() * MAX
   *       .
   *       So we need a .repeats() <= MAX
   */
  repeats: () => Node
  /**
   * Pointer to the instantiations of this loop.
   */
  instances: () => Many<Many<Ray>>
}

export type Many<T> = T extends Node ? Node : Graph<T> & T extends Ray ? Collapsable : {};

export interface Edge {
  // TODO Since an edge is just a subgraph, we can similarly put a direction on this entire subgraph. (values, weight, etc..)
  // TODO: Allow things like a probability on an edge, which affects .next as a programmatic superposition. (probability X).OR(probability Y)
  //        Needs some general way of implementing this type of thing.
}

/**
 * A ray, like a graph, has abstract directionality, but it goes through some point - Node within a larger Graph.
 */
export interface Ray extends INode, ConditionalStructure<Ray>, AbstractDirectionality<Ray> {

  value: () => Many<Node>

  /**
   * Deselect this abstract directionality by demoting to a Node.
   */
  self: () => Node
  /**
   * A ray might be constructed from multiple contexts, you can split off each context separately using this.
   */
  parts: () => Many<Ray>
  /**
   * Returns the equipped abstract directionality as a graph.
   * TODO: Disconnected parts of the graph should still be shown here?
   */
  context: () => Graph
  /**
   * Move this Ray to .self.
   * Example: In A-B-C, -B-.relative_context.equals(A-B-C) if A-B-C has -B- selected.
   */
  relative_context: () => Node
  /**
   * One of the .parts(), which is referenced.
   * TODO: Should not show up for a single ray.
   */
  referenced: () => Ray

  /**
   * Greater than: does "value" occur before this Ray.
   *
   * - If "value" is a Node/Graph, any Ray holding that value is matched.
   * - If "value" is a Ray, a particular location in the graph is selected. Say two rays have value "5", but with it is
   *   attached an abstract directionality indicating its location, that location too must be equal.
   *
   * TODO: For a number, calling .gt on a Node, defaults to selecting the numberline to call .gt on.
   * TODO: Allow the traverser to decide whether one starts traversing from this, or from value if its a Ray.
   */
  gt: (value: any) => Node
  gte: (value: any) => Node
  lt: (value: any) => Node
  lte: (value: any) => Node

  /**
   * Expand the Ray's subgraph in its place.
   * TODO: Should only be applicable to an expandable graph. (An entire graph could be collapse to a terminal with everthing ignored.)
   */
  expand: () => Many<Ray>
}

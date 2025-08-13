
/**
 * A node is a structureless point. "Structureless" in the sense that no structure is selected as context, and we can't
 * traverse its value, even though it has one. (But we can interact with it, minimally)
 */
interface INode {
  // TODO: All methods called here are on the value, so .neg is different compared to abstract directionality .neg.

  // TODO: Cast down to node without anything selected, vs ray which we ignore as Node (usual way interfaces work)

  //TODO: value: One or many: Ray (with (many) selected contexts) or conditional ray (-B-.OR(-A-)) or graph or conditional graph A-B-C.OR(D-E-F), .first() -> A-.OR(D-)
  //TODO get/set allow to also get/set methods which are on node etc.., but they dont set default behavior of that method
  //TODO Is any match: NOTHING.NOT()

  //TODO Want NOTHING.OR(-B-) so that things like a conditional graph, can have values like first() -> which are (A1|B1, A2|B2, NOTHING|B3)\

  // TODO !!
  // TODO: Many<> should allow for conditional on entries of the graph.

  //TODO    + Types
  //TODO THEN: Edges and edge selection how does it work?
  //TODO    - Isomorphism should check edge types/structure.
  //TODO    - .next() on edge should return next edge?
  //TODO THEN: Forced equivalence

  /**
   * Node: Equal in value (there is no structure).
   * Ray/Graph: Structure, and all values within that structure, are equal.
   */
  equals: (value: any) => Node

}

interface Node extends INode, ConditionalStructure<Node> {}

interface AbstractDirectionality<TSelf extends AbstractDirectionality<TSelf, TNode>, TNode = TSelf> {
  /**
   * Structurally equal (ignores value).
   */
  isomorphic: (value: any) => Node

  /**
   * Select all nodes in this structure
   */
  all: () => Many<TNode>

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
}

interface ConditionalStructure<TSelf extends ConditionalStructure<TSelf>> {
  // TODO: .NOT (LOOKAHEAD/BEHIND) (+ SUBSTRUCTURE) (.not on edges)
  not: () =>
    // TODO: Complement separately?
    /* If a ray, .not is the complement, where the entire graph is the universal set. */
    TSelf extends Ray ? Many<Ray>
    : TSelf

  or: <B>(b: B) => B extends TSelf ? TSelf : Node
  and: <B>(b: B) => B extends TSelf ? TSelf : Node
  // xor: <B>(b: B) => B extends TSelf ? TSelf : Node
  // nor: <B>(b: B) => B extends TSelf ? TSelf : Node
  // nand: <B>(b: B) => B extends TSelf ? TSelf : Node

  // TODO: A-B-C, D-E-F, (bool).if(-B-, -E-).next() = (bool).if(-C-, -F-) -> -C-.OR(-F-)
  if: <True, False>(_true: True, _false?: False) => True extends False ? False extends True ? True : Node : Node

  // TODO, Conditionally add structure, is there some other way of doing this better?
  conditionally: <B>(_if: () => Node, _true: (self: TSelf) => B, _false: (self: TSelf) => B) => B extends TSelf ? TSelf : Node
}

/**
 * A graph has abstract directionality, but there is no sense of "we're here at this point inside the graph".
 *
 * Any Node within this graph, is by default a Ray equipped with this graph as its "selected directionality".
 */
interface Graph<TNode = Ray> extends INode, ConditionalStructure<Graph<TNode>>, AbstractDirectionality<Graph<TNode>, TNode> {

  /**
   * Tag any arbitrary part of this structure with a "name".
   * This is for example how function parameters get their names.
   *
   * To tag anything matching some type use .tag(tag, graph.match(type))
   * TODO: This is just additional context on this structure.
   * TODO: Also add to Node: substructures of certain contexts have certain names. Say x/y axis.
   * TODO: How to get relative tags to the one taken.
   * TODO: If substructure changes, keep the name there? How to signal to the editor that certain new things are included/excluded here?
   * TODO: History of tags
   */
  set: (tag: any, substructure: any) => void // TODO Graph & { [tag]: substructure }
  get: (tag: any) => Many<Node> //TODO: .ONE_OF if multiple.

}
export type Many<T> = Graph<T>;

/**
 * A ray, like a graph, has abstract directionality, but it goes through some point - Node within a larger Graph.
 */
interface Ray extends INode, ConditionalStructure<Ray>, AbstractDirectionality<Ray> {

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
}

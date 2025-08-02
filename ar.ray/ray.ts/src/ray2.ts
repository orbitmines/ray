
/**
 * A node is a structureless point. "Structureless" in the sense that no structure is selected as context, and we can't
 * traverse its value, even though it has one. (But we can interact with it, minimally)
 */
interface Node {
  // TODO: All methods called here are on the value, so .neg is different compared to abstract directionality .neg.

  //TODO Conditional Structures: What about type XOR, probably still fine, put the XOR somewhere else than on node.
  //TODO    + Types
  //TODO THEN: Edges and edge selection how does it work?
  //TODO    - Isomorphism should check edge types.
  //TODO THEN: Forced equivalence

  /**
   * Node: Equal in value (there is no structure).
   * Ray/Graph: Structure, and all values within that structure, are equal.
   * TODO: Value might be Many<Node>, so value could be a (math) Set.?
   * TODO: Value might be a function like XOR applied to two binary values.
   */
  equals: (value: any) => Node


}

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
}

/**
 * A graph has abstract directionality, but there is no sense of "we're here at this point inside the graph".
 *
 * Any Node within this graph, is by default a Ray equipped with this graph as its "selected directionality".
 */
interface Graph<TNode = Ray> extends Node, AbstractDirectionality<Graph<TNode>, TNode> {

  /**
   * Tag any arbitrary part of this structure with a "name".
   * This is for example how function parameters get their names.
   *
   * To tag anything matching some type use .tag(tag, graph.match(type))
   * TODO: This is just additional context on this structure.
   * TODO: Also add to Node: substructures of certain contexts have certain names. Say x/y axis.
   * TODO: How to get relative tags to the one taken.
   * TODO: If substructure changes, keep the name there? How to signal to the editor that certain new things are included/excluded here?
   */
  set: (tag: any, substructure: any) => void
  get: (tag: any) => Many<Node> //TODO: .ONE_OF if multiple.

}
export type Many<T> = Graph<T>;

/**
 * A ray, like a graph, has abstract directionality, but it goes through some point - Node within a larger Graph.
 */
interface Ray extends Node, AbstractDirectionality<Ray> {

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

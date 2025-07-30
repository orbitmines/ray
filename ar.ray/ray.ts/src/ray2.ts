
/**
 * A node is a structureless point. "Structureless" in the sense that no structure is selected as context, and there's
 * no notion of a value we can traverse. (But we can interact with it, minimally)
 */
interface Node {
  // TODO: All methods called here are on the value, so .neg is different compared to abstract directionality .neg.

  //TODO What about type XOR, probably still fine, put the XOR somewhere else than on node.
  //TODO THEN: Edges and edge selection how does it work?
}

interface AbstractDirectionality<TSelf extends AbstractDirectionality<TSelf>> {
  /**
   * Select all nodes in this structure
   */
  all: () => Many<Node>
}

/**
 * A graph has abstract directionality, but there is no sense of "we're here at this point inside the graph".
 *
 * Any Node within this graph, is by default a Ray equipped with this graph as its "selected directionality".
 */
interface Graph<TNode = Ray> extends Node, AbstractDirectionality<Graph<TNode>> {

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
   * Returns the equipped abstract directionality as a graph.
   */
  context: () => Graph
  /**
   * Move this Ray to .self.
   * Example: In A-B-C, -B-.relative_context.equals(A-B-C) if A-B-C has -B- selected.
   */
  relative_context: () => Node
}

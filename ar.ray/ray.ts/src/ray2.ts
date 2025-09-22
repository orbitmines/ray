
/**
 * A node is a structureless point. "Structureless" in the sense that no structure is selected as context, and we can't
 * traverse its value, even though it has one. (But we can interact with it, minimally)
 */
export interface INode {
  // TODO: Context selected, like an object, but none of them referenced, so not a Ray.
  //       How is it known that a larger structure (like an edge or subgraph) has some context selected on it.
  //          -> Pointers of ray must know about it to ref it?

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

  // TODO: Maybe the .txt variant of the language is just a bunch of def's, both for functions and objects.
  //        |-> Generics are simply Object(T)(constructor arguments),
  //            -> How do we make sure Object(constructor arguments) works.
  //            -> Object could point to both Object and Object(T)
  //            -> Or generics are part of the function parameters.
  //        |-> Variables and methods defined on the context level are properties of the object.
  //              |-> You'd probably want to define code blocks which aren't defining the object, so { }

  //TODO    + Types
  //           - The .OR relationship may be across multiple Nodes. Say two disconnected branches, which either continue in A or continue in B, not both. And things like if it continues in A, then B continues like this other continuation.
  //              -> This is for example necessary for two concurrent programs (possibly with shared state) and assuming all possible orders in which the two could be executed.
  //           - .last is implementable as a subgraph type match. (Not sure I will do that though)
  //           - methods: overwrite if the same type overload if not.
  //           - A vertex and a terminal can't both point to the "latest" version of the other: It's a circular dependency. So something needs to say "point to the last variant".
  //              |-> Some way of first creating new references, then assigning changes without creating new references.
  //              |-> What does it mean to have both a specific ref, and one to the latest?
  //                |-> Needs an unambiguous way of preserving all histories while not duplicating everything for every connection there is.
  //                    |-> One way is to navigate with some global "up till here" counter, but this isnt a good solution
  //           - terminal.value points to a specific piece of a program, so it can ignore the value it entered on? So we can have a single program ref for all the edge references.
  //           - Defining a terminal: You want a "latest" variant of the variable to be the ref. So that you dont have to update it for every reference to the variable.
  //           - Maybe equivalent .initials, should match to the same .initial. and any continuation defined on .value of the terminal is deemed as a right one.
  //                |-> Removes the difference between hypergraph and this setup.
  //                |-> Also removes with terminal -> initial things.
  //                |-> Does make it so that when I have two terminals and I want to equiv them, I need to add together the .initial side. and join them together instead of allowing you to keep both references.
  //                      |-> More general way of merging two terminals.
  //                |-> Does make empty not work |- -|, or we disallow a |- -> |- (initial to initial), and it's always initial to terminal.
  //                |-> Does mean that when you have a terminal selected, you don't know which direction it's in. (Don't know if you're at a terminal or initial boundary)
  //                |-> Makes reversing direction easier.
  //                |-> To equiv them, add them together to a new reference. And replace both refs to that.
  //           - Two-way many, from a vertex to an initial, and an initial to a vertex. Or do we limit every initial to a single vertex?
  //           - Patterned rewrites like a functional programming language. ; Or a grammar like BNF.
  //              "data Maybe a = Just a | Nothing"
  //                |-> Just a function, Just a also a function. But functions don't automatically call?
  //                |-> Generics are similarly also just a function, No difference in (x, y) = [x, y] and <T, U> = [T, U]
  //           - Create types for string chars ints etc..
  //           - Create type which defines all possible structures.
  //           - Editor needs an intuitive, keyboard-friendly way of creating these structures.
  //           - You want in the editor: Take this structure, then remove/add something. ; Take some type and change it.
  //              - For Array.non_empty():
  //                Two options: Compiler should remove the empty Initial-Terminal from the type
  //                Or: the function application is a "Take this structure and change/add this".
  //           - Any program as a type. not just conditionally.
  //           - Do types only match to ungrouped variants (so .expand()ed rays) Or how would we specify?
  //                                                           .expand_all() -> Might be self-referential, but we can still point to it.
  //           - Type information on equivalence ray. .loop continuations for Tree/Graph. .loop on KV pairs for Object.
  //           - .select/.deselect contexts. ; binary number.select(numberline).equals(x)
  //           -
  //           - Disconnected vs connected graph, Tree needs to be connected. Connected by default?
  //           - .consistent doesn't check whether the same edge is consistent
  //           -
  //           - Current type matching doesn't know whether .next().previous() gives the same result.
  //               .consistent() = .has_next() && .next().previous().[includes / equals](self)
  // 		                           .has_previous() && .previous().next().[includes / equals](self)
  //                                  |-> .equals if there's only one possibility.
  //                                  |-> Don't check if there's no .next() or .previous() -> That's the .has_ checks.
  //           - In the case of Tree Type .reverse().length().max() < Infinity ; could be without max(), there's only one possibly value.
  //           - Want some form of Type.match_subgraph(subgraph) So we can check whether things like .OR are equal.
  //                -> This is different from .match in a type sense.
  //                -> Would want to use this for things like rendering the visual representations of a graph. "If contains this OR structure"
  //                -> Probably best: Could implement this as a .literally() on .OR. so it works for instance_of (which doesn't expand the .OR)
  //           -
  //           - Matching !=, ==, <=, >=, =, !, <, >
  //              [!, =].OR([!]) <-- This OR in sequence so can be rewritten as. [!, =].OR([!, =.not()]) when OR is not in sequence.
  //                  -> How to determine in sequence of a program vs parallel.
  //                  -> Control-flow/ordering is different.
  //              - Can also be:
  //                [!, ([=].OR(=.not()))] Which in sequence is, [!, ([=].OR( ELSE )]
  //           - Matching ANY until the first '\n' for example:
  //              - So not just [ANY looped, \n] because that would allow ANY Looped to contain \n.
  //              - But something like ANY.AND(\n.not()); Basically ANY except.
  //           - One-way loop reference vs a two-way loop reference (which needs another initial if it's coming from a terminal)
  //           - How do IDE's not 'whiten out' when syntax is incorrect, are they more loosely adapting the grammar somehow?
  //              I can imagine some form of locally checking if it makes sense, even after some previous error occurred.
  //                -> Use cached results as well? In case of an error.
  //           -
  //           - For grammars you'd want to reference collapsed groups. So I have some graph definition in which I've
  //             defined some named context variables. (Or where would these be defined? Just disconnected parts of the
  //             graph which we've named with a tag. -> So graph.tag would put a direction through the graph and give us
  //             that subgraph.), And within the structure I reference them and possibly expand them.
  //               -> Maybe not part of the graph (since we want .first etc. to work), but a property of it.
  //           -
  //           - Want to make sure that when designing this, that generated grammar rules on the fly based on what is in
  //                the structure, with (forward/backward) passes is still supported. So we can have something like
  //                dynamically representing an English sentence based on some AI model.
  //           -
  //           - You want things like access to the partially matched syntax, to display where it went wrong.
  //           -
  //           - How would defining some dynamically generated JavaScript for example work? What does that graph/syntax
  //              look like. Interleaved with JavaScript are some grouped structures, which one puts there with some
  //              single keystroke. This group is "outside" the syntax, but should be part of the type somehow?
  //               - It's a separate graph, so it's "properties" on the graph at specific locations in it. But the result
  //                  must match the type graph of the grammar. Some "inside" of some generating expression.
  //               - And part of this would be generating many different contexts: Directories and Files.
  //
  //TODO THEN: Edges and edge selection how does it work?
  //TODO    - Isomorphism should check edge types/structure.
  //TODO    - .next() on edge should return next edge?
  //TODO THEN: Forced equivalence
  //TODO Execution layer: Simplifications of graph expectations leading to different algorithms. For example .first() in a graph, not having to traverse the whole graph first to check all possible initials.
  //TODO, Something like for all prime numbers do this. Loop over infinities.

  match: <T>(pattern: T) => T extends INode ? Many<T> : Node

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

// Parallel by default if possible, like variables declared on a NOde.

// TODO: Where to place .NOT on structure (LOOKAHEAD/BEHIND) (+ SUBSTRUCTURE - is achieved by collapsing/expanding) (.not on edges)
export interface ConditionalStructure<TSelf extends ConditionalStructure<TSelf>> {

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
  disallow_loops: () => Many<Ray> //TODO Some implementation using conditionally
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
  //        - In the case of probabilities split from some pool in the case of a division event. So that a subgraph of the probabilities still adds up to 1.
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
  parts: () => Many<Ray> //TODO It's not parts, because whenever you refer to a Ray, it's Many<Ray>
  /**
   * Returns the equipped abstract directionality as a graph.
   * TODO: Disconnected parts of the graph should still be shown here?
   */
  context: () => Graph
  /**
   * Move this Ray to .self.
   * Example: In A-B-C, -B-.relative_context.equals(A-B-C) if A-B-C has -B- selected.
   */
  relative_context: () => Node //TODO Is the ~ operator
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

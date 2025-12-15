---
GitHub:
  - https://github.com/akissinger/chyp
---

---

*Some notes from last year < 2023-12-20*

##### People
- [[Filippo Bonchi]]
- [[Fabio Gadducci]]
- [[Aleks Kissinger]]
- [[Paweł Sobocinski]]
- [[Fabio Zanasi]]

- [[2012.01847.pdf|String Diagram Rewrite Theory I: Rewriting with Frobenius Structure]]
	- "Two diagrams that can be toepologically deformed into each other without cutting or joining wires must necessarily describe the same map" 
		- An example of homotopy  if that frame is identified as some complicated hyperedge deemed homotopically as "the same" - "ignorantly, as the same"
	- "(i.e. the set of endpoints of aconnected component) matters"
		- Ignorant at the vertices. (which may as well be described as the same thing) - this is generally probably not the case.
	- Splitting wires/merging: 
		- "These generators and rules are known in the literature as a [[Special Commutative Frobenius Algebra (SCFA)]]. A category where every object is equipped with an [[Special Commutative Frobenius Algebra (SCFA)]] is called a [[Hypergraph Category]]."
			- Non-branching (so no equivalencies at the edges) are discussed in the 2nd paper. (or: [[Generic Symmetric Monoidal Category]](ies))
	- "This rewriting-modulo step can be seen as the formal, syntactic underpinning to the intuitive notion of rewriting defined directly on string diagrams"
		- This misses the point of that similarly one might say that for the syntactic one - it's just the historically used one. So if the diagrammatic way was the usual way of thinking it would be the other way around. Better phrased as merely a translation to the other way of thinking.
	- "two Frobenius algebras interacting as a bialgebra"
		- "ZX-Calculus" / involve two interacting Frobenius algebras at their heart
	- [[Peter Selinger]]
	- 2.2 : Entire thing can merely be descriped as moving connections to different vertix'es frames (/rays). As with ZX-Calculus or any rewriting.
	- 3.4 : Merely additional access to information one doesn't ignore which alters whether it's a match. - All intuitive, though not necessarily obvious whether the writer here or generally wants to self-referentially construct it, similar to my thing with Rays.
	- redex ; **Something to be reduced according to the rules of a formal system**.
	- [[Monoidal PROduct and Permutation Category (PROP)]]

- [[2104.14686.pdf|String Diagram Rewrite Theory II: Rewriting with Symmetric Monoidal Structure]]
	- References
		- [[John Power]]
		- [[Gordon Plotkin]]
		- [[Steve Lack]]
		- [[Burroni]]
		- [[Samuel Mimram]]
		- [[Obradovic]]
		- [[Hadzihasanovic]]
	- "Pushout complements always exist in HypΣ , but they are not necessarily unique. They are so if the rule is left-linear, that is, if K → L is monic" / 
	- Identities and symmetries in CspD (HypΣ ) are monogamous
	- What about just restructure the whole thing in a separate cage, then it's dissallowed by internal cyclicity right? -0 if that's not what this paper is after.
	- Termination/confluence
		- A rewriting relation is terminating if it admits no infinite sequence of rewrites
		- it is confluent if any pair of hypergraphs (or terms, etc.) arising from G by a sequence of rewriting steps can eventually be rewritten to the same hypergraph
		- Taken together, these properties imply the existence of unique normal forms.
	- Frobenius semi-algebras are Frobenius algebras lacking the unit and counit equations (No termination, no instantiation?, still dup/merge though as a form of termination/instantiation)
		- [ ] [[PENDING (2027?+) ; Physics (& Hardware)]] ; relevant to quantum theory, such as H*-algebras
- [[string-diagram-rewrite-theory-iii-confluence-with-and-without-frobenius.pdf|String diagram rewrite theory III: Confluence with and without Frobenius]]

---

https://github.com/orbitmines/orbitmines.com/pull/5

As a possible way to add some grounding to the project, create a slice of it by implementing/creating a user interface to @akissinger 's Chyp (https://github.com/akissinger/chyp). - Would also be nice as a way to introduce the project to him, as he's likely embarking on a project in 2024 with a lot of overlap.

- Less hacky than https://github.com/orbitmines/orbitmines.com/pull/1
- Possibly compile python to wasm to directly interface with the code, otherwise just translate the ideas to a `Ray.ts` equivalent.
- Need to be able to compile both to the graphical string diagrams & the "proof documents" (which the diagrams would be too)

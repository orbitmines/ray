# Ray — Grammar spec (from the comments in `v0/.entrypoint.ray`)

Status legend: **Decided** · **Open** (to ask) · **See L§n** (already decided in `Language.md`).
Each item: its ID, where the comment is (`ep:line`), what it says, and a proposal.
Answers are recorded under **Decided** at the end, by ID.

---

## G1. Reading and whitespace

- **G1.1 Tabs and odd spaces** — *ep:1211, 1256*: "Assumes \t = ' ', probably safer to say
  tabs are invalid syntax"; "All Unicode space separators (+ \t), except the normal space, are
  illegal characters … so text editors don't show blocks where they aren't."
  Proposal: an error on a tab or any non-U+0020 space separator in code (allowed inside strings
  and comments).
- **G1.2 Compound words** — *ep:1788–1791*: the `.ray2.json` draft says "a word that is several
  words joined is split where it can be". v0: a word is what it spells. Proposal: don't split;
  longest declared match already handles `towards-a-universal-language` (F-A6).
- **G1.3 Fixpoint rounds** — *ep:1800*: the draft allows ten rounds; v0 runs until nothing
  changes. Proposal: keep "until nothing changes", with a diagnostic when a cycle is detected.
- **G1.4 Comments on the same line** — *ep:1147, 1530*: a comment after code on the same line
  belongs to that line. The comment above or beside an `assert` is its error message, but a
  side comment counts only if a newline follows it.
- **G1.5 Comments are transparent** — *ep:1024*: a modifier flags a property as a comment,
  so it doesn't interfere with indenting.
- **G1.6 Warnings** — see L§5.6.
- **G1.7 A first statement with leading whitespace** — see L§5.6.

From the drafts review (2026-10-06).

- **G1.8 Any text is legal syntax** — *`.ray2/_todo/…/instance/Expression.ray:2`*: `class Expression = String // Any
  string is legal syntax`. **Q** — Recommend: no text is a syntax error. What no rule reads stays a value (an unresolved
  Expression, which is a String) with a diagnostic, and later rules may still read it.
  **Answered (user, 2026-10-06):** text no rule reads is an error, and the error is its diagnostic: reading goes on, so a file can hold several. The unread text stays an unresolved Expression that later rules may still read.

## G2. Calls and juxtaposition (*ep:1217–1264, 1383–1420*)

- **G2.1 What a space means** — *ep:1227–1234*: `" "` is a call when the thing before expects an
  argument (A) or a callback (B); for functions defined on Expression, prefer those (`x if c`);
  many spaces are allowed; many `.` go to defined methods.
- **G2.2 `=>` after `()` optional** — *ep:1232*: "After () of a function, => is optional, and
  the function starts directly." This conflicts with the decision of 2026-09-22 ("function literal
  needs `=>` before its body"). Open: is that decision still right?
- **G2.3 `=>` after `<` Extended** — *ep:1233*: `=>` can optionally follow `< Parent`.
- **G2.4 Prefer the defined** — *ep:1235*: "If A & B → prefer A if variable is defined."
  Consistent with L§5.1 (a defined name wins).
- **G2.5 Parameterless functions** — *ep:895, 1223, 1263–1264*: a parameterless function on a
  line is evaluated; one that returns a function tries the first thing `()` can apply to; "any
  parameterless function is equivalent to the type it returns; any variable is equivalent to a
  parameterless function which returns it". This is L§10.2 (engine).
- **G2.6 Units juxtaposed** — *ep:1238*: `1d 10h 10ms`: `1d` doesn't define `.10h`, so each part
  is checked on its own; if one doesn't define the next, resolve globally, then check again.
- **G2.7 `x+y.func`** — *ep:1217*: `x+y.func` = `x+(y.func)`; `(x+y).func` must be explicit.
- **G2.8 `,` binds tighter than `if`** — *ep:1220, 1226*.
- **G2.9 Operator groups in parentheses** — *ep:1237, 1043*: `.length (x ? <= b : == a)`,
  `length (> 3 | == 3)`, `(x ? read : write) property`, `.(property | property2)`. Related to
  L§10.1 `.( expr )`.
- **G2.10 Chained comparisons in types** — *ep:1239*: `Array<3 < length < 5>`.
- **G2.11 Mixed positional and named arguments** — *ep:1249*: `Ball(radius: 5m, POSITIONAL, other: 5m, POSITIONAL)`.
  Listed in L§10.1 as library work; here the order rule: positional args fill the unnamed
  parameters in order, whatever named ones sit between.
- **G2.12 A line ending with an operator** — *ep:1250*: "If a line ends with `|` or another
  method, it is not expected to continue on the next line; we prefer the `|` on the next line."
  Proposal: a warning for a trailing operator; the leading-operator continuation is L§10.1's
  "multi-line operator continuation".
- **G2.13 A block given to a value** — *ep:1413–1419*: a block given to a property is an effect
  on the type's constructor; a block given to any other object is called and its value used, so
  `5\n+ 3` works. `5\n+3\n+3`: the `+` is on the previous result (`_`), not on `this`. When a
  method accepts both a `(): *` and a block, prefer the `(): *` as the last argument.
- **G2.14 Globally defined wins for `[]`** — *ep:1240, 1439*: `[1, 2, 3]` calls the global `[]`,
  not a local `[property]`. How is "prefer global" flagged?
- **G2.15 `'()` and modifiers before a definition** — L§10.1.
- **G2.16 Lambdas** — *ep:1270–1271*: "lambda should just be `() a + b`?" (probably not), or `\lambda`.
  See G2.2.
- **G2.17 Calling a string** — L§10.5 (engine).

From the drafts review (2026-10-06).

- **G2.18 A method's type and its return type** — *`.ray2/Grammar.ray:374–412, 585`, `.ray2/Program.ray:261, 420`*:
  `test: Program{terminating} <OPTS>{FILTER} l() -> Return {`, `func: Terminating ()`, "sets return_type, not function
  type?". Nothing says what `name: T` means on a method, or how a return type is written. **Q** — Recommend: on a method,
  `name: T` types the method itself (a Program narrowing: `f: Terminating (x) => …`). The return type follows the
  parameters, `(x): R => …` (as in `(x): T` captures), not `-> R`. Drop `-> Return` and `l()`.
  **Answered (user, 2026-10-06):** `f: Terminating (x) => …` types the method; the return type follows the parameters, `(x): R => …`; the draft's `-> Return` and `l()` are dropped.
- **G2.19 Arguments indented under a call** — *`.ray2/Grammar.ray:563–581`*: `if` / `  a` / `  ==` / `  b` / `  block`:
  "if(a, == b block)", or "(if condition).block"? G2.13 covers continuation, not an indented argument list. **Q** —
  Recommend: lines indented under a call are its arguments in order; an operator-led line (`== b`) continues the previous
  argument (G2.13); the last is the block when the callee takes a `(): *`. The example is `if(a == b, block)`.
  **Answered (user, 2026-10-06):** indented lines under a call are its arguments in order; an operator-led line continues the previous (G2.13); `a ; + b` applies to the result before `;`; a closure argument extends to the next `,`/`->` at its level.
- **G2.20 `;` keeps the continuation's subject** — *`.ray2/_todo/…/instance/Expression.ray:50`*: "; does not change the
  selected context to + on." **Q** — Recommend: `a ; + b` applies `+ b` to the result before `;`. `;` separates statements
  but does not reset what a continuation applies to (G2.13).
  **Answered (user, 2026-10-06):** indented lines under a call are its arguments in order; an operator-led line continues the previous (G2.13); `a ; + b` applies to the result before `;`; a closure argument extends to the next `,`/`->` at its level.
- **G2.21 A closure argument reaches the next `,`** — *`.ray3/Node.ray:58`*: "Accept closure up to syntax for , for
  instance, or -> should have it too". **Q** — Recommend yes: a closure argument extends up to the next `,` (or `->`) at
  its level, consistent with `,` composing one value (2026-09-27).
  **Answered (user, 2026-10-06):** indented lines under a call are its arguments in order; an operator-led line continues the previous (G2.13); `a ; + b` applies to the result before `;`; a closure argument extends to the next `,`/`->` at its level.
- **G2.22 Member names with holes** — *`.ray3/Node.ray:108–109`*: `{property: (\S[], "{", *, "}", \S[])+} =>
  this[property - punctuation]`, so `a.foo{x}bar` reads the member `"foo" + x + "bar"`. **Q** — Recommend yes: a computed
  member name uses the same `{…}` holes as string interpolation (L§10.1).
  **Answered (user, 2026-10-06):** no holes in member names: they would interfere with the `{…}` filter and are confusing. Holes stay in strings (L§10.1).

## G3. Operators, precedence and direction (*ep:768–870, 1319–1370, 1391–1397*)

- **G3.1 Precedence** — decided: declaration order (standing instructions). *ep:1241*: "precedence
  defined by order in class (with before & after extends, to go after)". Open: how a class
  places an operator *between* two existing ones: `Node~method` (L§4.2, *ep:1118*), or
  `Type = {higher} + OtherType` (*ep:1421*)?
- **G3.2 Whole-run reduction** — *ep:1332–1370*: the draft's discover(cursor) → reduce(triples)
  algorithm: at the loosest band, peers that *share* an operand (chainable / opposite direction)
  expand with `&`, a genuine conflict (mixed associativity at one level) is an error, otherwise
  one root with associativity as the tie-break. Brackets are triples with a None side. Proposal:
  adopt it as the language-side GRAMMAR_RULE's reduction (not engine).
- **G3.3 Associativity vs direction** — *ep:832–840, 1319–1323*: left/right-*associative* is how
  a run of one operator groups; left-to-right / right-to-left is which side an operator applies
  to. L§5.1 decided "right grouping is declared by written direction". Open: is associativity
  then *only* direction, or a separate modifier?
- **G3.4 The mixing error** — *ep:1396–1397*: "Cannot mix {} in a single (possibly infix)
  expression with mixed associativity, use parentheses"; info: "you can only mix everything left of
  the variable as rtl, and everything right as ltr".
- **G3.5 Chainable** — decided: a modifier on the method (`chainable <`). *ep:1286–1288* also
  writes it as a rewrite rule: `(a.(op: chainable) b)** op c => a op b && b op c`. Proposal: the
  modifier registers exactly that rewrite.
- **G3.6 `&` vs `&&`** — *ep:1318*: "`&` because it supports non-boolean resulting values, and `&`
  collapses to `&&`".
- **G3.7 Variable operators** — *ep:1384–1390*: `((op))` for a variable method, requiring `((` and
  `))`, so `a ((a | b): String) b` is a function definition; `x {op} y`; "space always means ignore
  the space when {op}". L§10.1 listed `x {op} y` / `⸨op⸩`. Open: which spelling.
- **G3.8 RTL vertical direction** — *ep:1391–1392*: right-to-left defaults to the same vertical
  direction (next line down), with an option to switch it.
- **G3.9 Ambiguous attachment** — *ep:1084–1086*: `return ME if` (return ME, or return `ME.if`?):
  the space prefers Expression-`if`. `boolean` vs a class `bo`, an operator `ole`, and a class `an`:
  prefer the attached (longer) reading.
- **G3.10 A newline between `()` groups** — *Compiler:211*: "Newlines `() ()` should apply to
  each other, or pending operations should too."
- **G3.11 A filter for one operator** — **Open** (2026-10-02, ask the user): with `accepts` removed, how
  is a rule written that applies to one specific operator only (e.g. only `-`)? `tests/app/precedence.ray`
  `minus` and `tests/app/rewrite.ray` `minus` still use `accepts`.

From the drafts review (2026-10-06).

- **G3.12 How far `:` reaches left** — *`.ray2/Grammar.ray:584–589`*: `a + b: Terminating () c + d` is
  `a + (b () c + d)`; `(a + b)()` to annotate more. **Q** — Recommend the draft: `:` binds only to the nearest operand on
  its left, as a hugging member does (G2.7). Parenthesise to annotate a larger expression.
  **Answered (user, 2026-10-06):** the nearest operand only, like a hugging member (G2.7).
- **G3.13 One argument per side** — *`.ray2/Grammar.ray:242–249`*: arity is always 1 (`,` collapses many into one); a
  bracket operator is a triple with a None side (prefix `[None [{}] r]`, postfix `[l [{}] None]`); juxtaposition and `,`
  are operators like any other. G3.2 rejected the whole-run reduce, not these. **Q** — Recommend keeping them as
  principles: (1) every operator takes one argument per side; (2) prefix, postfix and bracket operators are binary with a
  None side; (3) juxtaposition and `,` are ordinary operators with a precedence.
  **Follows (2026-10-06):** kept as principles: (1) every operator takes one argument per side; (2) prefix, postfix and bracket operators are binary with a None side; (3) juxtaposition and `,` are ordinary operators with a precedence, from Almanac A5 (a function has one argument, described structurally), the 2026-09-27 answer (`,` composes one value) and G2.9; G3.2 rejected only the whole-run reduce.
- **G3.14 Found, but declared for the other direction** — *`.ray2/Grammar.ray:506`*: "'Found method X but it wasnt
  flagged as {direction}'". **Decided (draft)**: when a method is found but its declared direction doesn't fit where it
  is written, the diagnostic says so ("`X` is declared right-to-left") instead of "unresolved". (With G3.4.)
- **G3.15 Both directions at once** — *`.ray3/Node.ray:121`*: `bidirectional: Modifier = left-to-right & right-to-left`,
  "where if both ltr and rtl are used, their shared boundary is what they both invoke on"; *`.ray2/Grammar.ray:174–175`*:
  "allowed to be on either side. ; right-to-left on nothing is a top-level class?". G6.2 dropped a different
  `bidirectional X`; G3.3 doesn't say what both directions mean. **Decided (draft, `.ray3`)**: `bidirectional` is the `&`
  of both directions; where both apply, the operator is invoked on their shared boundary. **Q** (`.ray2`) — Recommend:
  the side the operand is on picks the reading, and a right-to-left operator with nothing on its right (`!` at the end)
  is a postfix rule on the class to its left.
  **Answered (user, 2026-10-06):** the side picks the reading only for an operator that is actually usable on either side; a right-to-left operator is usable only right-to-left (with nothing on its right it does not apply).
- **G3.16 Precedence as a modifier** — *`.ray3/Node.ray:57`*: `// TODO Modifier: precedence(before Node.==)`. **Q** —
  conflicts with Decided G3.1: G3.1 places an operator by its position after a method label (`Node~method`); the draft
  writes a modifier `precedence(before X)` / `precedence(after X)`. Recommend (review): allow the modifier, since
  modifiers are language-side, but define it as G3.1's placement (`precedence(after X)` = written after `X~`) so there
  is one mechanism. Otherwise drop it.
  **Answered (user, 2026-10-06):** add the modifier `precedence(before X)` / `precedence(after X)`, language-side, placing the method relative to X; declaration order (G3.1) stays the default.

## G4. Patterns and rules (*ep:285–287, 1245–1255, 1301–1313, 1377–1382, 1748–1757*)

- **G4.1 A pattern must match the whole** — *ep:1748–1750*: a pattern with a lookahead doesn't
  succeed by stopping early: if it doesn't match all it was given, it fails, unless something else
  in it matches the rest.
- **G4.2 A signature per option** — *ep:1755–1756*: `..{right: .} | {left: .}.. | .. (right?) =>`.
- **G4.3 Capturing** — *ep:1301–1303*: how to capture patterns, negations, forward/backward looking.
- **G4.4 `dynamically` in a pattern** — *ep:1214–1215, 1254–1255*: `dynamically match` is the
  default; a variable bound in a pattern is in scope for the whole expression, and if it changes,
  the pattern is re-matched. It can't affect itself (only what produced the rule); it can affect
  others and later matches.
- **G4.5 Rules at a direction** — *ep:1252–1253*: `RULES @ <->`, `RULES @ *`, `RULES @ <-`,
  `RULES @ ->` (further along in this pattern; each loop iteration hands the variable to the next).
- **G4.6 `~` for grammar properties** — *ep:1377–1379*: `a~{b}` sets a grammar property the way
  `a.b` sets a member; `test ~()`, `~(args, a)`. L§4.2 decided `~` is for entry points. Open: is a
  grammar property an entry point?
- **G4.7 `{}` default meaning** — *ep:1379–1380, 1383*: `{}` is optional; `[]` accepts a closure the
  way `.()` does; by default a space in `{}` is ignored as syntax, so a `.func` may apply.
- **G4.8 A rewrite needs a keyword** — *ep:1371*: rewriting every `test5` to `TODO` is ambiguous,
  so require a keyword for applying rewrite rules.
- **G4.9 No new syntax without `()` or `=>`** — *ep:1258*.
- **G4.10 Methods require** — *ep:1245–1247*: `T : {+ (: Number)}`, `Node{+ (: Number)}`: a type that
  requires a method; `{(): boolean}`.
- **G4.11 Predicate-prefixed variants** — *ep:1244*: `⊢11₂ ? Binary³ : Binary₂ = 10₂`: a variant that
  starts as a predicate matches the variable.
- **G4.12 `if` blocks for `for`** — *ep:1225*: `;` in pattern matching with `[]` includes
  `is_last` etc., available to `for`.

From the drafts review (2026-10-06).

- **G4.13 A rule's literal word is not a variable** — *`.ray2/Grammar.ray:422–423`*: "What if 'for' is already defined
  in scope? Say the same for 'approximation' or 'optimization'". **Q** — Recommend: a literal word in a rule head matches
  only the written word, never a variable's value. A local named `for` shadows the name only where it is used as a value.
  **Follows (2026-10-06):** a literal word in a rule head matches only the written word, never a variable's value; a local named `for` shadows the name only where it is used as a value, from T4.10 (a written literal reads exactly itself) and the engine invariant of word-bounded literals.
- **G4.14 A negated pattern fails; it does not stop** — *private journal, IDE:601–607 (paraphrased)*: a negated part
  (`not '=>'`) does not end the match just before the excluded text; it only says the match must not continue with it.
  A pattern that then doesn't match all it was given fails, unless another alternative matches. **Decided (draft)**
  (with G4.1, G4.3). To check: whether the reader's `not` does the opposite (the note was written against a parser test
  that succeeded with `"hello"`).
- **G4.15 `{{expr}}`** — *`.ray3/Node.ray:69–71`*: `{{expr: (): *}} => expr.= = (obj) => expr<local: obj>; expr`
  ("Required to return (): * for .while to work"): assigning to a lazy expression runs it with that object as local.
  **Q** — intent unclear. Recommend asking whether the double brace is the lazy-expression literal; drop it if not.
  **Answered (user, 2026-10-06):** dropped.

## G5. Grammar phases and conflicts (*ep:1001–1013, 1265, 1776*)

- **G5.1 Phases** — the draft: phases are language definition + dependencies + the program; "each
  `<` from `@[]` is a separate phase"; a grammar override affects only its own phase unless
  imported as a language-changing phase.
- **G5.2 Circular prevention** — detect rules that prevent each other: "The rules `{/* */}` and
  `{/$ $/}` circularly prevent each other from existing." A rule defined inside itself is
  "Unresolved".
- **G5.3 An "eval now" flag** — *ep:1004*: a flag to evaluate something immediately so that runtime
  and grammar checks can run (e.g. everything calling `class`).
- **G5.4 Syntax tests** — *ep:1776*: tests that change the externals the grammar is written with,
  then read something.

From the drafts review (2026-10-06).

- **G5.5 A clashing reading is dropped** — *`.ray3/Node.ray:40–45`*: rule text that would define a rule already defined
  elsewhere "wouldnt fail, it would just drop this interpretation". Refines Decided G5.1/G5.2 (circular prevention is an
  error). **Q** — Recommend: a reading that would define a rule already defined elsewhere is dropped, not an error; only
  a mutual prevention that leaves no reading is the error.
  **Answered (user, 2026-10-06):** a rule defined again with `=>` overrides the earlier one; with `&=>` it superposes with it (as decided 2026-09-27 for subclass rules).
- **G5.6 First defined wins within a phase** — *`.ray3/Node.ray:8–9`*: "Whichever one is defined first would 'prevent'
  the other one from being defined … pay attention when importing other code that it doesnt nullify certain grammar
  rules". **Q** — Recommend: within one phase the first-defined rule wins; importing code that would nullify an existing
  rule is a diagnostic.
  **Answered (user, 2026-10-06):** see G5.5: `=>` overrides, `&=>` superposes; no first-wins rule.

## G6. Modifiers (*ep:1022–1029, 1266, 1295–1298*)

- **G6.1 The modifier list** — `external`, `initializer`, comment-transparent, `io`, `pure`,
  right-to-left, and a switch-away-from-ltr operator for real ambiguity. L§8.1 decided `io` and
  `initializer` are *inferred*. Open: which of these remain written modifiers.
- **G6.2 `bidirectional` / `trivially`** — *ep:1266*: matching a program with `X: boolean = false | true`
  gives the method modifier `bidirectional X` if X doesn't exist on the function.
- **G6.3 Levels of meaning** — *ep:1295–1298*: normal methods are flagged "higher-level"; disable or
  reverse all of mathematics; `mathematics.optional` for alternative versions of `:`; edit-time
  equivalences per style ("mathematician + nomathematics").

From the drafts review (2026-10-06).

- **G6.4 A modifier on a block** — *`.ray2/Grammar.ray:120–121`*: "These accept a block, which applies it to all
  properties. or just a single one, like most modifiers." W5.2 decided this for permissions only. **Decided (draft)**:
  every modifier takes one definition or a block; on a block it applies to each definition in it (`force { … }`,
  `@private { … }`, `static { … }`).
- **G6.5 The signature of a modifier** — *`.ray3/Node.ray:74`*: `Modifier = (this: *): { location: a (this, *) }`: a
  modifier is a function of what it modifies, answering a located value. Plan §1 says only "a method that takes the
  method definition". **Q** — Recommend adding the signature as written.
  **Follows (2026-10-06):** the draft's signature is added as written: `Modifier = (this: *): { location: a (this, *) }`, a modifier is a function of what it modifies, answering a located value, from Plan.md §5 (port the drafts in their style) and G6.4 (Decided draft), which already uses it.

## G7. Equivalences (*ep:1272–1300, 1314–1316*)

- **G7.1 Kinds** — force (automatic), suggest (preferential), compile-time (optimization,
  approximation, plain). L§10.8 lists them as engine work. *ep:1281–1282*: each kind can be turned
  off per method; Ctrl-Z undoes an applied equivalence and forbids it there.
- **G7.2 `==` rules are provably reversible** — *ep:1314*: `==` not `=>`.
- **G7.3 Standard rewrites** — double negation, idempotence (*ep:1315–1316*).
- **G7.4 Backspace over an equivalence** — *ep:1280*: when `->` is shown as an arrow, does backspace
  remove the `>`?
- **G7.5 Errors on misspelling** — *ep:1283–1284*: the error should be on `Rmisspelled` and
  recognise it could be a Node; `x.∈` "wrong direction" should suggest reading it differently.
- **G7.6 Preferred spellings** — *ep:1556*: "I want a : prefer this syntax, so the IDE suggests
  rewriting it"; preferences configurable.

From the drafts review (2026-10-06).

- **G7.7 How far an approximation may be off** — *`.ray2/Grammar.ray:69, 117`*: `approx a: float * b: float => a * (1 /
  b)`; "How to say what kind of approximation". **Q** — Recommend: `approx` carries its error as a type,
  `approx<error: ≤ 1 ulp>` (N4.10's uncertainty), and applies only where the reader accepts that error (`with` an error
  budget).
  **Answered (user, 2026-10-06):** the error is a narrowing on the result type (uncertainty, N4.10).
- **G7.8 LaTeX-like symbol input** — *`.ray2/_todo/…/instance/UI/symbols.ray:1–5`*: input more extensive than vscode's,
  from MathJax `BaseMappings.ts` and vscode-latex-input `default-mappings.json`. **Q** — Recommend: typing `\alpha` gives
  `α` through a `force` equivalence in a style (`Style.latex`, G6.3), its table read from those mappings as a `$.latex`
  language. IDE backlog (W7).

---

## Decided

Answers from 2026-09-30.

- **G1.1** Tabs, and any Unicode space separator other than U+0020, are an error in code
  (allowed inside strings and comments).
- **G2.2** `=>` is required before a function body (keeps the decision of 2026-09-22). The draft's
  "`=>` optional after `()`" is dropped.
- **G1.3** Evaluation runs until nothing changes, with a diagnostic when a cycle is detected.
- **G1.4** A side comment always counts, for the line it is on, whether or not a newline follows.
  Otherwise, the comment directly above a statement attaches to it (and is an `assert`'s message).
- **G2.13** Continuation lines apply to the previous result: `5` / `+ 3` / `+ 3` is `(5 + 3) + 3`.
- **G2.12** A line ending with an operator continues onto the next line.
- **G3.1** An operator is placed between existing ones by its position after a method label:
  `Node~method` (L§4.2); declaration order then decides.
- **G3.2** Keep the pairwise precedence rules. Add the mixing error and "pointing apart" as more
  pairwise rules; the draft's whole-run reduce is not adopted.
- **G3.3** Associativity is only direction: right-associative means declared right-to-left.
  There is no separate associativity modifier.
- **G3.7** A variable used as an operator is written `a [x] b`, the same spelling as in rule heads.
- **G2.14** "Prefer the global" (`[1, 2, 3]` calling the global `[]`) is said with a modifier on
  the definition.
- **G2.14b** The modifier is `global`: `global [] (items) => …`.
- **G4.1** A pattern that doesn't match the whole of what it was given fails, unless something
  else in it matches the rest.
- **G4.4** `dynamically match` is the default for every pattern: a variable a pattern binds is in
  scope for the whole expression, and changing it re-matches the pattern (not the rule that
  produced it).
- **G4.8** No keyword: a rule is a rule, and scope decides where it applies. A rewrite can also be
  applied by hand everywhere, e.g. `if.inline` + enter inlines every use (undoable). That is IDE
  work, and the last item on the list.
- **G4.6** `~` is not used for grammar properties; it is only for entry points (L§4.2).
- **G5.1/G5.2** Detect rules that circularly prevent each other (an error). A grammar change applies
  to its own phase; a dependency's grammar is imported only as a language-changing phase. Fully
  language-side where possible.
- **G6.1** Anything that can be inferred is inferred. What can't be inferred stays a written
  modifier: `external`, the comment flag, `right-to-left`. `pure` may be written as an assertion.
- **G7.1** All three equivalence kinds (force, suggest, compile-time), each switchable per method;
  undoing an applied one forbids it there. Themes/styles can be enabled, e.g.
  `inline Style.mathematics`, which forces reduction rules such as mathematical operators instead
  of words.
- **G1.2** Joined words are not split: a word is what it spells.
- **G2.6** `1d 10h 10ms` is Quantity's own rule in Unit.ray (juxtaposed quantities add, largest to
  smallest); nothing general in the grammar.
- **G6.1b** No direction-switch marker. If `f` has a method `-`, `f -x` is `f - x`, and `f(-x)`
  must be written with parentheses; if it has no such method, there is no ambiguity.
- **G3.4** Within one expression, operators left of the shared operand read right-to-left and those
  right of it left-to-right; any other mix is an error asking for parentheses.
- **G3.8** Right-to-left text still goes downward after a newline. There is no vertical option.
- **G4.2** Each alternative of a rule may carry its own signature. `|` there is just the
  superposing method `|`.
- **G4.10** A type that requires a method is a narrowing: `Node{+ (: Number)}`.
- **G2.9** Yes: an operator in parentheses is the method as a value (Almanac §4.1):
  `var (condition ? == : <=) 5`, `Unicode.GeneralCategory.(Punctuation | Symbol)`. Anything
  within parentheses is a closure with the accessed variable loaded into its context, so the
  object's `.next` wins over the scope's.
- **G2.11** Named arguments bind by name wherever they stand; positional ones fill the remaining
  parameters in order.
- **G4.5** Not a grammar feature: `@ <-`, `@ ->`, `@ *`, `@ &caller` are *locations* (Almanac §3,
  Ecosystem). See `Almanac.md` A3 and `Types.md` T7.
- **G2.7** A hugging `.member` binds tighter than any operator: `x+y.func` is `x+(y.func)`.
- **G2.8** `,` binds tighter than `if` on one line: `a, b if c` is `(a, b) if c`. Only on that line: in a
  multi-line list, each line's `if` applies to that line's element, as in the UTF-8 draft:
  ```
  class UTF-8 < TF, sequence: (
    prefix: 1[]{length == 0..4},
    U0: Binary{length == 8 - prefix.length}{⊢0},
    (10₂, U1: Binary⁶) if prefix ⊢11₂
    (10₂, U2: Binary⁶) if prefix ⊢111₂
    (10₂, U3: Binary⁶) if prefix ⊢1111₂
  )[]
  ```
- **G3.9** `return ME if c` is `(return ME) if c`, a postfix `if` on the statement; the longest declared
  word wins (`boolean`, not `bo ole an`).
- **G5.3** No "evaluate now" flag: the fixpoint evaluates definitions as they are found.
- **G6.3** A style is a set of forced equivalences switched on or off (`Style.mathematics`: `∀` ↔
  `.every`, `∈` ↔ `:`); turning it off rewrites back to words.
- **G7.4** Backspace removes the whole displayed glyph of an equivalence; Ctrl-Z gets the typed form back.
- **G4.7** Padding spaces inside brackets aren't separators (`{ .func }` = `{.func}`), and `[]` accepts
  a closure like `.()` does.
- **G4.9** New syntax can't be defined without `()` or `=>`.
- **G4.11** Kept: a variant that starts with a predicate tests the variable
  (`⊢11₂ ? Binary³ : Binary₂ = 10₂`).
- **G5.4** Syntax tests: a `tests/app/grammar.ray` whose claims override a rule in a scope and check
  the reading.
- **G7.2/G7.3** `==` rules are reversible equivalences, usable both ways; double negation and
  idempotence are standard ones in Compiler.ray.
- **G6.2** `bidirectional X` is dropped.
- **G2.3** `=>` after `< Parent` is dropped.
- **G2.10** Chained comparisons work inside type arguments too: `Array<3 < length < 5>`.
- **G2.5** A parameterless function is equivalent to the type it returns, and a variable to a
  parameterless function returning it.
- **G3.5** The `chainable` modifier registers the rewrite `(a op b)** op c => a op b & b op c`,
  language-side.
- **G3.6** Chained comparisons are joined with `&`, which collapses to `&&` on booleans.
- **G3.10** Nothing extra: G2.13 covers `()` groups on the following line (a continuation line applies to
  the previous result).
- **Covered elsewhere:** G1.6, G1.7 (L§5.6), G2.15 (L§10.1), G2.16 (G2.2), G2.17 (L§10.5).
- **G1.5** No comment modifier: comments are `//` and nested `/* */` with Markdown (L§5.5), they attach to
  a line by G1.4, and they never affect indentation.
- **G2.4** "A defined name wins" is *not* a general rule; it holds only where decided (the `^` case of L§5.1).
- **G4.3** Negation and look-around are narrowings on the capture (`{x: T{!= `=`}}`), with `⊢`/`⊣` anchors
  for boundaries; look-behind reads `<-`.
- **G7.5** Diagnostics suggest alternatives: a misspelled name may still be a Node, and a wrong-direction
  operator (`x.∈`) suggests the other reading.
- **G4.12** Positional helpers (`is_first`, `is_last`, `.index`) are always available to an element matched
  with `[]`, e.g. in `for`.
- **G7.6** "Prefer this syntax" is a `suggest` equivalence per style (G7.1), configurable per person.
- **Covered elsewhere:** G2.1 (Almanac A8: a space may replace `.`, and calls by juxtaposition).


// Alias of ==.instance_of, is: "is"
import path from "path";
import { fileURLToPath } from "url";
import {Language, Node, Program} from "./language.ts";
import {is_string} from "./lodash.ts";

export const Ray = new Language('ether', '0.E2026.0D.0')
  .extension('.ray')

  // .pass(_ => _
  //   .ref('bootstrap')
  //
  //   .cd('@ether/$/.ray', _ => _.load('Node.ray'))
  //
  //   .syntax(E => {
  //     // const PATTERNED_RULE = E( E(E, '{', E.reinterpet(AT_PASS_2), '}', E).length('>=', 1).freeze(), E.until('=>'), E.block())
  //     E.patterned_rule = (node: (_: Reader) => Node) =>
  //       E(E(), '{', E().reinterpret('std'), '}', E()).repeats('>=', 1).bind('pattern').freeze().until('=>').block(_ => _.reinterpret('std'))
  //         .interpret(self => node(self.reader).external_method(
  //           E(...self.pattern.map(x => is_string(x) ? x : E()))
  //         ))
  //
  //       // E.block = E.any(E.block(), E.block('{', '}')) for the languages that want to set things
  //       // inner .freeze is overridden by .reinterpret,
  //
  //       // .split the spaces in front of to get the different |/& patterns, skip |/&.
  //       // .interpret is reverted when .reinterpret happens
  //       // .freeze on rule pattern part, not the body.
  //       // .buffer on .interpret means buffer effect for next pass.
  //
  //     return [E(
  //       [E().goto(E.patterned_rule((_: Reader) => _.runtime.CTX))],
  //       E().upto('class *').upto('\n').block(_ =>
  //         [E.goto(E.patterned_rule((_: Reader) => _.runtime.BASE))]
  //       )
  //     )]
  //   })
  // )
  .abstract(fn => {
    if (fn.enabled('refuse_abstract_interpretation')) {
      fn.debug('abstract', 'Refused to abstractly call function, defaulting to its return type.')
      return fn;
    }
    // TODO Time/trace the function allow it to go own for a small while in certain configurations/cache certain results.

    return fn;
  })

  //TODO Set class * location on base class.
  .base(_ => _
    .external_method('external', (self, method, args) => {
      args.with('external')
      self.realize()
      const name = args.string?.trim();
      if (!name) { args.error('external', '`external` requires a method name as its argument.'); return args; }
      //args.debug('test', [...self.methods.all()].join(', '))
      if (!self.methods.has(name)) return args.error('external', `Expected method \`${name}\` to be externally defined by the runtime, but it wasn't`);
      return args;
    }, fn => fn.with('accepts_program'))
    // .external_method('ex', null, fn => fn.with('refuse_abstract_interpretation'))
    // .external_method('initializer')
    .external_method('left-to-right', (self, method, args) => args.with('left-to-right'), fn => fn.with('accepts_program'))
    .external_method('right-to-left', (self, method, args) => args.with('right-to-left'), fn => fn.with('accepts_program'))
    .external_method('left-associative', (self, method, args) => args.with('associativity', 'left'), fn => fn.with('accepts_program'))
    .external_method('right-associative', (self, method, args) => args.with('associativity', 'right'), fn => fn.with('accepts_program'))
  )
  .context(_ => _
    .external_method('local', (self, method, args) => self)
    // `</` is the right-to-left modifier instantiated with no right-hand
    // argument. Where `right-to-left X` would stamp the right-to-left flag
    // on X, `</` has nothing on its right, so it stamps `direction` on its
    // *left side* (the enclosing expression) — a different concept from the
    // method-level flags: those say which side of its receiver a method's
    // call site sits on (a method may carry both, bidirectional). This
    // says which way the surrounding expression should be read, so the
    // anchor (rightmost variable) is found first and methods on either
    // side are matched against their flags. Lives on global context, not
    // base class.
    //
    //TODO Wire the token handler to detect direction='right-to-left' on
    //     the current expression and re-walk: snapshot the expression's
    //     source range, find the anchor, walk both sides applying the
    //     direction-flag-matching methods, produce the last-applied result.
    //     Diagnostics for the wrong-direction case:
    //       error[method]: Undefined method `X` on `Y`.
    //       (hint when a method exists but its flag doesn't match:
    //        Found a method `X` on `Y` but it wasn't flagged as
    //        <expected-direction>.)
    //     Generalize later: any token marked `right-to-left` *without* a
    //     captured right-hand argument should trigger the same path.
    // `</` is detected via its fn-level `direction` option (declarative
    // marker — same key the handle's trigger check reads). The body just
    // returns args; we deliberately do NOT stamp `direction` on args's
    // options, because args.value.options aliases the args's resolution
    // options dict (sticky-flags layer), and stamping there would leak
    // the per-expression direction state into the symbol's permanent
    // flags — every future match of the same name would then spuriously
    // fire the rewalk trigger.
    .external_method('</', (self, method, args) => args, fn => fn.with('right-to-left').with('direction', 'right-to-left'))
  )

  .syntax(E => {
    /** Direction-agnostic token handler. Reads one token in `_._direction`
     *  (LTR by default, RTL when the parse-root has been flipped to `.rtl`)
     *  and folds it into `_.program.result`. The same function powers both
     *  the outer LTR parse (registered via `E.token`) and the RTL re-walk
     *  triggered by `</`. The only direction-sensitive bit is "behind me"
     *  (whether the previous char was whitespace) — we use `_.behind.peak()`
     *  which flips to `.right` when `.rtl` is set. */
    const handle = (_: any) => {
      let saw_newline = false;
      _.skip_while((ch: string) => {
        if (ch === '\n') saw_newline = true;
        return ch === ' ' || ch === '\n';
      });
      if (saw_newline) {
        if (_.program.result) _.program.pending.push(_.program.result.settle());
        _.program.result = null;
      }
      _.capture_while((ch: string) => ch !== ' ' && ch !== '\n');

      if (_.program.result) {
        _.program.result.realize();
        if (_.program.result.enabled('accepts_program') && _.behind.peak() === ' ') {
          _.program.result.debug('test', 'accepts_program');

          (_.value.ctx ?? _.program.runtime.CTX).realize();

          const prev = _.program.result;
          const resolved = _.match(_.string, _.value.ctx ?? _.program.runtime.CTX);

          // Per-pair check, no chain on Program, no recursion at settle:
          //   - if `resolved` itself accepts a program, prev's call needs the
          //     eventual inner — build a composition node (`prev ∘ resolved`)
          //     that accepts a program too, so the next pair sees a chainable
          //     result. The composition fires when the leaf finally arrives.
          //   - otherwise `resolved` is the leaf → call prev with it now.
          if (resolved.enabled('accepts_program')) {
            const composed = new Node(_.program);
            composed.value.encoded = (_self: Node | undefined, _method: Node, args: Node) => {
              if (args.none) return prev.eager.call(resolved);
              return prev.eager.call(resolved.eager.call(args));
            };
            composed.value.options['accepts_program'] = 'true';
            _.program.result = composed;
          } else {
            _.program.result = prev.call(resolved);
          }
          return;
        }
      }

      const resolved = _.match(_.string);

      // First token of a fresh expression — remember it so a later trigger
      // (e.g. `</`) can re-walk the source range starting here.
      if (_.program.result === null) _.program.expression_start = resolved;

      // Direction-aware folding. Three branches once we have a prev:
      //   1. resolved declares an effective direction change (its fn carries
      //      a `direction` option, the same key its body stamps on args):
      //      consume prev as args, so the body can stamp `direction` on the
      //      running result and trigger the rewalk below. Detection is
      //      declarative — the same `direction` option mechanism the
      //      post-call rewalk-trigger keys off — not a literal token check.
      //   2. resolved carries the flag matching the current parse direction
      //      (`left-to-right` while LTR, `right-to-left` while RTL): apply
      //      it as a method on prev (method-on-receiver). prev becomes
      //      `value.self` and the call fires with empty args, so the
      //      method body sees its receiver via `self`.
      //   3. resolved carries the *wrong*-direction flag only: mismatch.
      //      Emit `error[method]: Found a method `X` on `Y` but it wasn't
      //      flagged as <expected-direction>.` on prev (the receiver in the
      //      wrong position) and leave prev as the result.
      //   Without prev, resolved is the anchor — just save.
      const switchesDirection = !!resolved.value.options['direction'];
      if (_.program.result) {
        const ltr = resolved.enabled('left-to-right');
        const rtl = resolved.enabled('right-to-left');
        const direction = _._direction === -1 ? 'right-to-left' : 'left-to-right';
        const matchesDirection = (direction === 'right-to-left' ? rtl : ltr);
        const carriesOpposite = (direction === 'right-to-left' ? ltr : rtl) && !matchesDirection;

        if (switchesDirection) {
          // (1) Direction-switch token: consume prev as args; body stamps
          //     `direction` on the result, triggering rewalk below.
          _.program.result = resolved.eager.call(_.program.result);
        } else if (matchesDirection) {
          // (2) Method-on-receiver: prev is the receiver, resolved is the method.
          //     If prev is itself an unresolved forward, the *receiver* is the
          //     real failure — surface that on prev rather than firing the call
          //     and ending up with an "Unresolved <method>" diagnostic on the
          //     method node (chain fallout from a missing receiver).
          const prevR = _.program.result.value.resolution;
          if (prevR && !prevR.resolved) {
            _.program.result.error('forward ref', prevR.message);
          } else {
            resolved.value.self = _.program.result;
            _.program.result = resolved.eager.call(new Node(_.program, null, null));
          }
        } else if (carriesOpposite) {
          // (3) Wrong-direction flag → mismatch on prev (the misplaced receiver).
          const recvName = _.program.result.string ?? '';
          _.program.result.error('method', `Found a method \`${resolved.string}\` on \`${recvName}\` but it wasn't flagged as ${direction}.`);
        } else {
          // No direction flag — fall back to eager save (treat as arg / value).
          resolved.save();
        }
      } else {
        resolved.save();
      }

      // Direction switch detection. When branch (1) fired a direction-switch
      // token (its fn carries the `direction` option), re-walk the entire
      // expression's source range as anchor + two chains. Multi-line ranges
      // are fine — the boundary is whatever `expression_start` recorded. We
      // key off the per-token decision (made above) rather than re-reading
      // result.value.options, because the result's options dict aliases the
      // resolution's sticky-flags map and would falsely retain `direction`
      // from a previous expression.
      if (switchesDirection && _.program.expression_start) {
        _.trace('rewalk', `firing rtl rewalk from ${(_.program.expression_start as any).begin} to ${(resolved as any).begin}`);
        rewalkExpression(_, _.program.expression_start, resolved, 'right-to-left');
      }
    };

    /** Skip-then-capture one whitespace-delimited token in the parse-root's
     *  current direction and return `_.match(_.string)`, or null when the
     *  capture is empty. Same pieces the outer parse uses (`skip_while`,
     *  `capture_while`, `match`) — direction comes from `_._direction`, so
     *  the function works for both LTR and RTL walks. Mutates `_`'s cursor
     *  and selection like normal capture does; callers restore as needed. */
    const captureToken = (_: any): Node | null => {
      _.skip_while((ch: string) => ch === ' ' || ch === '\n');
      _.capture_while((ch: string) => ch !== ' ' && ch !== '\n');
      if (!_.string) return null;
      return _.match(_.string);
    };

    /** Apply a sequence of resolved Nodes onto `anchor`. `tokens` arrive in
     *  the order we want them applied — anchor-outward in source order.
     *  A token carrying `matching` becomes the new pending method (the
     *  previous pending finalizes with no arg first); a non-flagged token
     *  attaches as the previous pending's arg; a token carrying the
     *  opposite flag emits the mismatch diagnostic; with no pending and no
     *  flag we fall back to an eager call so stray tokens stay reachable. */
    const isMethod = (n: Node): boolean => n.value.resolution?.resolved ?? false;
    const foldChain = (program: Program, anchor: Node, tokens: Node[], matching: 'left-to-right' | 'right-to-left'): Node => {
      const opposite = matching === 'left-to-right' ? 'right-to-left' : 'left-to-right';
      const empty = () => new Node(program, null as any, null);
      let chain: Node = anchor;
      let pending: Node | null = null;
      let broken = false;
      for (const m of tokens) {
        if (broken) break;  // chain broken by mismatch — don't fabricate further errors
        if (m.enabled(matching)) {
          if (pending) { pending.value.self = chain; chain = pending.eager.call(empty()); }
          pending = m;
        } else if (m.enabled(opposite) || isMethod(m)) {
          // Wrong-direction flag, OR a registered method without the matching
          // flag at all — both are direction mismatches in this position.
          // Stop the chain here: subsequent tokens would try to be methods on
          // a receiver that's already past a broken link, and the resulting
          // `Found method X on Y` errors would be misleading.
          m.error('method', `Found a method \`${m.string}\` on \`${anchor.string}\` but it wasn't flagged as ${matching}.`);
          broken = true;
        } else if (pending) {
          pending.value.self = chain;
          chain = pending.eager.call(m);
          pending = null;
        } else {
          chain = chain.eager.call(m);
        }
      }
      if (pending && !broken) { pending.value.self = chain; chain = pending.eager.call(empty()); }
      return chain;
    };

    /** Re-walk the current expression's source range using anchor + two
     *  chains. Captures tokens via `captureToken` (direction-agnostic, uses
     *  the same Node primitives as the outer parse — no source slicing) in
     *  `direction`, picks the anchor (first non-direction-flagged token in
     *  walk order), then folds the two chains via `foldChain` — the same
     *  function for both sides, just with different `matching` flags. The
     *  leftmost-applied (= last-applied) chain is the visible result; the
     *  other chain still runs (its diagnostics + option stamps land). */
    const rewalkExpression = (_: any, expression_start: Node, trigger: Node, direction: 'left-to-right' | 'right-to-left'): void => {
      const program: Program = _.program;
      const savedDirection = _._direction;
      const savedCursor = _.cursor;
      const savedSelection = _.selection.map((s: any) => ({ begin: s.begin, end: s.end }));

      // Drop any diagnostics the LTR walk emitted inside this expression's
      // range — the rewalk re-interprets the same source under a different
      // direction, and the LTR errors were tentative under an interpretation
      // we now know is wrong (`</` flipped the line). Same source, in
      // [expression_start.begin, trigger.begin).
      const rangeStart: number = (expression_start as any).begin ?? 0;
      const rangeEnd: number = (trigger as any).begin ?? Number.POSITIVE_INFINITY;
      const sf = (expression_start as any).source_file;
      const keep = (d: any): boolean => {
        const dn = d.node;
        if (!dn || dn.source_file !== sf || dn.cursor == null) return true;
        return !(dn.cursor >= rangeStart && dn.cursor < rangeEnd);
      };
      program.diagnostics = program.diagnostics.filter(keep);
      // Diagnostics.items is a separate array (it's what print() reads); the
      // program.diagnostics filter alone leaves the stale entries visible.
      const log = program.runtime.log as any;
      if (Array.isArray(log.items)) log.items = log.items.filter(keep);

      _.cursor = (trigger as any).begin;
      _.selection = [];
      if (direction === 'right-to-left') _.rtl; else _.ltr;

      // Boundary in RTL is the leftmost position we may consume; in LTR the
      // rightmost. After each capture, `_.begin` (RTL) or `_.end` (LTR) is
      // the captured token's outer edge — stop once it has reached the
      // boundary so the next capture won't cross it.
      const boundary: number = (expression_start as any).begin ?? 0;
      const past = (): boolean => direction === 'right-to-left' ? _.begin <= boundary : _.end >= boundary;
      const walked: Node[] = [];
      while (!_.direction.done() && !past()) {
        const r = captureToken(_);
        if (!r) break;
        walked.push(r);
      }

      _._direction = savedDirection;
      _.cursor = savedCursor;
      _.selection = savedSelection;

      // Drop resolution-registry nodes inside this expression's range so the
      // verify sweep doesn't re-emit "Unresolved" errors on tokens we just
      // re-interpreted.
      for (const r of program.runtime._resolutions) {
        r.nodes = r.nodes.filter(n =>
          !(n.source_file === sf && n.cursor != null && n.cursor >= rangeStart && n.cursor < rangeEnd)
        );
      }

      if (walked.length === 0) return;

      // Anchor selection: a variable counts as an anchor only if there's at
      // least one method-like token further in walk order (= further on its
      // walk-side in source). For RTL: anchor is the rightmost variable that
      // has a method on its source-LEFT. If no such variable, fall through
      // to the implicit `[global context]` — the chain folds against an
      // unnamed receiver and only direction-flag checks apply.
      const isMethodLike = (n: Node) =>
        isMethod(n) || n.enabled('left-to-right') || n.enabled('right-to-left');
      let anchorIdx = -1;
      for (let j = 0; j < walked.length; j++) {
        const m = walked[j];
        if (isMethodLike(m)) continue;
        for (let k = j + 1; k < walked.length; k++) {
          if (isMethodLike(walked[k])) { anchorIdx = j; break; }
        }
        if (anchorIdx !== -1) break;
      }

      const matching = direction;
      const opposite = direction === 'right-to-left' ? 'left-to-right' : 'right-to-left';

      if (anchorIdx === -1) {
        // No valid anchor — implicit `[global context]`. Methods in the
        // walked range need the flag matching the walk-side of source from
        // the implicit receiver; the receiver has no source position, so we
        // don't emit eager calls, only the direction-flag mismatch errors.
        // Stop after the first mismatch so the chain doesn't fabricate
        // further "method on [global context]" errors past the broken link.
        for (const m of walked) {
          if (m.enabled(opposite)) {
            m.error('method', `Found a method \`${m.string}\` on \`[global context]\` but it wasn't flagged as ${opposite}.`);
            break;
          }
          if (isMethod(m) && !m.enabled(matching) && !m.enabled(opposite)) {
            m.error('method', `Found a method \`${m.string}\` on \`[global context]\` but it wasn't flagged as ${opposite}.`);
            break;
          }
          // Matching-direction-flagged but unresolved: the position is fine,
          // but the symbol itself is missing — surface the forward-ref error.
          if (m.enabled(matching) && !isMethod(m)) {
            const r = m.value.resolution;
            if (r && !r.resolved) { m.error('forward ref', r.message); break; }
          }
        }
        // Clear program.result so the LTR walk's stale value (the
        // direction-switch's call return — typically a forward ref) doesn't
        // get settle()'d at end-of-expression and re-fire `Unresolved`.
        program.result = null;
        return;
      }

      const anchor = walked[anchorIdx];
      // If the anchor is an unresolved forward, the entire chain depends on
      // a name we don't have. Emit a single "Unresolved" error on the anchor
      // and stop — every method beyond it would be a misleading "method on
      // <unresolved>" diagnostic.
      const r = anchor.value.resolution;
      if (r && !r.resolved) {
        anchor.error('forward ref', r.message);
        return;
      }

      // Resolved anchor — fold both chains around it.
      const before = walked.slice(0, anchorIdx).reverse();
      const beforeFlag = opposite;
      foldChain(program, anchor, before, beforeFlag);

      const after = walked.slice(anchorIdx + 1);
      const visible = foldChain(program, anchor, after, matching);

      program.result = visible;
    };

    E.token(handle);

    return E()
  })

  .pass(_ => _
    .ref('std')

    .cd('@ether/$/.ray', _ => _.loadDirectory('.', { recursively: true }))
    // .cd('@ether', _ => _.load('Ether.ray'))
  )

// Auto-exec when run directly (e.g. `tsx src/spec.ts` / `npm run spec`).
// Importing this file as a module (e.g. from the language server) leaves
// `Ray` ready to wire up without triggering a full run.
const _isMainEntrypoint = (() => {
  if (!process.argv[1]) return false;
  try { return fileURLToPath(import.meta.url) === path.resolve(process.argv[1]); }
  catch { return false; }
})();

if (_isMainEntrypoint) Ray.abstract().exec()
// Ray.backend('llvm').repl()
// Ray.backend('llvm', 'X').build()
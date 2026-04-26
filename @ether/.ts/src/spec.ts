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
 
    .external_method('test-middle', (self, method, args) => self)
    .external_method('test-right', (self, method, args) => {
      method.info('test', `test-right fired on \`${self.string ?? '?'}\``);
      return self;
    }, fn => fn.with('accepts_program'))
    .external_method('test-left', (self, method, args) => {
      method.info('test', `test-left fired on \`${self.string ?? '?'}\``);
      return self;
    })
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
        if (_.program.result) {
          const settled = _.program.result.settle();
          // Force the settled chain to realize NOW, not at verify time.
          // accepts_program-ending expressions (e.g. `external right-to-left
          // X`) build a `composed` node that lazily wires up the chain;
          // until something realizes it, the chain's side effects (most
          // notably modifier-body stamping like `args.with('right-to-left')`
          // on X's resolution.options) don't happen — and a later line that
          // references X then sees stale flags. Realizing at saw_newline
          // fires the chain in source order, which matches what a user
          // reading the file expects.
          settled.realize();
          _.program.pending.push(settled);
        }
        _.program.result = null;
        // Reset expression_start so the next expression's first token
        // re-pins it (deferred opposite-direction methods deliberately
        // leave it set across iters within the same expression).
        _.program.expression_start = undefined;
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
      // (e.g. `</`) can re-walk the source range starting here. Only set
      // when not already set: deferred opposite-direction methods leave
      // `result` null across multiple iters, and we want `expression_start`
      // pinned to the *first* deferred token, not the most recent one.
      if (_.program.expression_start == null) _.program.expression_start = resolved;

      // Direction-aware dispatch (only when there's a prev):
      //   1. switchesDirection — resolved declares an effective direction
      //      change via its fn-level `direction` option. Consume prev as
      //      args; the trigger detection below re-walks the expression in
      //      the new direction.
      //   2. matchesDirection — resolved carries the flag matching the
      //      current parse direction. Bind it as a method on prev (prev
      //      becomes `value.self`, call fires with empty args). If prev is
      //      itself an unresolved forward, the *receiver* is the real
      //      failure: emit on prev instead of firing the call (which would
      //      drop an "Unresolved <method>" on the method — chain fallout
      //      from a missing receiver).
      //   3. wrongDirection — resolved is method-shaped (registered method
      //      OR carries the opposite-direction flag) but doesn't match the
      //      walk direction. Emit `Found a method X on Y but it wasn't
      //      flagged as <expected>.` Receiver is prev's name, except when
      //      prev is itself a direction-switch token (no real receiver yet
      //      in the chain — the implicit receiver is `[global context]`,
      //      and the error lands on resolved instead of prev).
      //   Without prev, resolved is the start of an expression — just save.
      const switchesDirection = !!resolved.value.options['direction'];
      const ltr = resolved.enabled('left-to-right');
      const rtl = resolved.enabled('right-to-left');
      const isResolvedMethod = resolved.value.resolution?.resolved ?? false;
      // Anchor candidacy is about *direction position*, not method-ness:
      // a registered method without direction flags (e.g. `test-middle`)
      // can be the anchor that opposite-direction methods bind to.
      const isDirectionFlagged = ltr || rtl || switchesDirection;
      const opposite = _._direction === -1 ? ltr && !rtl : rtl && !ltr;

      // Anchor-based opposite-direction folding: when an opposite-direction
      // method appears with no receiver-yet, it's waiting for the *next*
      // anchor. We don't apply it manually — we re-run the token handler
      // in the opposite direction over the already-walked range, seeded
      // with the anchor as the running result. The handler's own dispatch
      // (matchesDirection, accepts_program-composed, etc.) does the work,
      // so chains like `test-middle test-right test-middle test-left
      // test-left` and `B ∍ A ∊ C` bind methods on either side of an
      // anchor — including the `B ∍` shape where the rtl method takes
      // its left neighbor as args (via accepts_program).
      //
      // The deferral path below leaves `result === null` and pins
      // `expression_start` to the first token of the expression, so this
      // anchor-case fires whenever we hit a non-direction-flagged token
      // with deferred state outstanding.
      const expr_start = _.program.expression_start as Node | undefined;
      if (!isDirectionFlagged && expr_start && _.program.result === null) {
        const target: 'left-to-right' | 'right-to-left' = _._direction === -1 ? 'left-to-right' : 'right-to-left';
        rewalkExpression(_, expr_start, resolved, target, resolved);
        _.program.expression_start = resolved;
        return;
      }

      // Defer an opposite-direction method:
      //   - no prev: nothing to consume yet, just stash and wait.
      //   - has prev + accepts_program: prev becomes the method's args (the
      //     `B ∍ A` shape). Reset result so the next non-flagged token
      //     triggers the anchor fold above; expression_start (still pinned
      //     to the original first token) keeps the range start put.
      // Without accepts_program, a prev-bearing opposite token has nowhere
      // for that prev to go — fall through to the wrongDirection error.
      if (opposite && !switchesDirection) {
        if (_.program.result === null) return;
        if (resolved.enabled('accepts_program')) {
          _.program.result = null;
          return;
        }
      }

      if (_.program.result) {
        const direction = _._direction === -1 ? 'right-to-left' : 'left-to-right';
        const matchesDirection = (direction === 'right-to-left' ? rtl : ltr);
        const oppositeFlag = (direction === 'right-to-left' ? ltr : rtl);
        // wrongDirection means the token is *method-shaped* and in the wrong
        // position. A registered method without direction flags AND without
        // `accepts_program` (e.g. `test-middle`) is variable-shaped — it
        // juxtaposes onto the chain just like a forward ref would, and
        // doesn't trigger the mismatch error. Methods that accept_program
        // (callable with args) DO trigger it, since they have a real chain
        // role and the position matters.
        const wrongDirection = !switchesDirection && !matchesDirection
          && (oppositeFlag || resolved.enabled('accepts_program'));

        // When prev is an unresolved forward, the receiver itself is the
        // real failure. Resolve to the actual cursor-bearing forward in
        // the resolution registry — emitting on `prev` directly may land
        // on a juxtaposition lazy whose cursor is undefined, which would
        // render via a stack fallback and bypass cascade dedup.
        const prev = _.program.result;
        const prevR = prev.value.resolution;
        const prevForward = prevR && !prevR.resolved
          ? ([...prevR.nodes].reverse().find(n => (n as any).cursor != null) ?? prev)
          : null;

        // Resolved-side forward-ref: when `resolved` is itself an unresolved
        // method (e.g. `rtlOnly` in `rtlOnly v`), surface its forward ref
        // before considering `prev`'s. In RTL walks `resolved` is the
        // source-earlier token, so its missing name is the primary failure;
        // in LTR, only fall back to it when prev is fine.
        const resolvedR = resolved.value.resolution;
        const resolvedForward = resolvedR && !resolvedR.resolved && (resolved as any).cursor != null
          ? resolved
          : null;

        if (switchesDirection) {
          _.program.result = resolved.eager.call(prev);
        } else if (matchesDirection) {
          if (resolvedForward && _._direction === -1) {
            resolvedForward.error('forward ref', resolvedR!.message);
          } else if (prevForward) {
            prevForward.error('forward ref', prevR!.message);
          } else if (resolved.enabled('accepts_program')) {
            // Mirrors the early-branch composition for accepts_program, but
            // with the direction-bound receiver: prev (the anchor) is bound
            // as `self`, and the method waits for the next juxtaposed token
            // to arrive as `args` (which the early branch will deliver via
            // composed.call(arg)).
            const anchor = prev;
            const m = resolved;
            const composed = new Node(_.program);
            composed.value.encoded = (_self: Node | undefined, _method: Node, args: Node) => {
              m.value.self = anchor;
              return m.eager.call(args);
            };
            composed.value.options['accepts_program'] = 'true';
            _.program.result = composed;
          } else {
            resolved.value.self = prev;
            _.program.result = resolved.eager.call(new Node(_.program, null, null));
          }
        } else if (wrongDirection) {
          // In a rewalk (RTL), an unresolved receiver makes the chain's
          // interpretation unreliable — surface "Unresolved <prev>" rather
          // than a direction-mismatch that's downstream of the missing
          // name. LTR (the user's source-order reading) keeps the mismatch
          // because the receiver is what the source actually wrote.
          if (_._direction === -1 && prevForward) {
            prevForward.error('forward ref', prevR!.message);
          } else if (_._direction === -1 && prev.enabled('direction')) {
            // prev is the direction-switch marker (`</`); the actual
            // receiver is the *next* non-flagged variable in the walk.
            // Peek one token forward (in walk direction) and emit on that
            // variable, so the diagnostic lands on the source-anchor that
            // was trying to apply the misplaced method — the way `test`
            // is trying to apply `external` in `test external </`.
            const savedCursor = _.cursor;
            const savedSel = _.selection.map((s: any) => ({ begin: s.begin, end: s.end }));
            _.skip_while((ch: string) => ch === ' ' || ch === '\n');
            _.capture_while((ch: string) => ch !== ' ' && ch !== '\n');
            const peekStr = _.string;
            if (peekStr) {
              const target = _.match(peekStr);
              target.error('method', `Tried to apply \`${resolved.string}\` with \`${target.string ?? peekStr}\` but \`${resolved.string}\` wasn't flagged as ${direction}.`);
            }
            _.cursor = savedCursor;
            _.selection = savedSel;
          } else if (_._direction === -1) {
            // RTL rewalk: emit on the misplaced method.
            const recvName = prev.string ?? '';
            resolved.error('method', `Found a method \`${resolved.string}\` on \`${recvName}\` but it wasn't flagged as ${direction}.`);
          } else {
            // LTR (source order): the prev is the receiver the user wrote
            // — emit there so the squiggle lands on the source-order
            // receiver, not on the method that exposed the mismatch.
            const recvName = prev.string ?? '';
            prev.error('method', `Found a method \`${resolved.string}\` on \`${recvName}\` but it wasn't flagged as ${direction}.`);
          }
        } else {
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
        const target = resolved.value.options['direction'] as 'left-to-right' | 'right-to-left';
        const current = _._direction === -1 ? 'right-to-left' : 'left-to-right';
        // Only re-walk when the token actually flips us into a new direction;
        // otherwise we'd loop on every token recapture inside the rewalk.
        if (target !== current) {
          _.trace('rewalk', `firing ${target} rewalk from ${(_.program.expression_start as any).begin} to ${(resolved as any).begin}`);
          rewalkExpression(_, _.program.expression_start, resolved, target);
        }
      }
    };

    /** Re-run the token handler over the expression's source range under a
     *  new direction. The handler's own dispatch (matchesDirection /
     *  wrongDirection / unresolved-receiver / direction-switch) builds the
     *  chain — no separate anchor pass or fold step. We first clear the
     *  diagnostics + resolution-nodes the prior walk emitted in-range, so
     *  the re-interpretation starts clean.
     *
     *  When `seed` is provided, it pre-populates `program.result` so the
     *  recursive walk starts with the seed as the running receiver. This is
     *  how an anchor-targeting fold works: the LTR walk hits a variable that
     *  has deferred opposite-direction methods to its left, and seeds an
     *  RTL walk over that range with the variable as the anchor. The handler's
     *  matchesDirection branch then binds each method on the anchor — and
     *  because it goes through the handler, accepts_program-style chains and
     *  method-on-method composition work the same way they would in the
     *  outer parse. */
    const rewalkExpression = (_: any, expression_start: Node, trigger: Node, direction: 'left-to-right' | 'right-to-left', seed?: Node): void => {
      const program: Program = _.program;
      const sf = (expression_start as any).source_file;
      const rangeStart: number = (expression_start as any).begin ?? 0;
      const rangeEnd: number = (trigger as any).begin ?? Number.POSITIVE_INFINITY;

      const inRange = (n: any): boolean =>
        !!n && n.source_file === sf && n.cursor != null && n.cursor >= rangeStart && n.cursor < rangeEnd;
      const keep = (d: any): boolean => !d.node || !inRange(d.node);
      program.diagnostics = program.diagnostics.filter(keep);
      // Diagnostics.items is a separate array (it's what print() reads);
      // the program.diagnostics filter alone leaves stale entries visible.
      const log = program.runtime.log as any;
      if (Array.isArray(log.items)) log.items = log.items.filter(keep);
      for (const r of program.runtime._resolutions) {
        r.nodes = r.nodes.filter(n => !inRange(n));
      }

      const savedDirection = _._direction;
      const savedCursor = _.cursor;
      const savedSelection = _.selection.map((s: any) => ({ begin: s.begin, end: s.end }));

      // Start at the boundary opposite the walk direction so the trigger
      // itself is the first token captured: RTL walks leftward, so the
      // cursor sits one past the trigger's right edge. With a `seed`, the
      // trigger is the anchor (already populated as `result`) — we don't
      // want to re-capture it, so we start at its inner edge instead.
      const triggerEnd = (trigger as any).end ?? rangeEnd;
      const triggerBegin = (trigger as any).begin ?? rangeEnd;
      _.cursor = direction === 'right-to-left'
        ? (seed ? triggerBegin : triggerEnd + 1)
        : (seed ? triggerEnd : Math.max(rangeStart - 1, 0));
      _.selection = [];
      if (direction === 'right-to-left') _.rtl; else _.ltr;
      program.result = seed ?? null;
      program.expression_start = undefined;

      // Stop once the most-recently-captured token has reached the original
      // expression boundary — `_.begin` (RTL) / `_.end` (LTR) tracks the
      // current selection's outer edge.
      const past = (): boolean => direction === 'right-to-left' ? _.begin <= rangeStart : _.end >= rangeEnd;
      const handler = program.runtime._tokenHandler!;
      while (!_.direction.done() && !past()) handler(_);

      _._direction = savedDirection;
      _.cursor = savedCursor;
      _.selection = savedSelection;
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
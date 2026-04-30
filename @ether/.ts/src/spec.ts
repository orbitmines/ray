import path from "path";
import { fileURLToPath } from "url";
import {Language, Node, Program} from "./language.ts";
import {Standard, Version} from "./version.ts";
import {is_string} from "./lodash.ts";

export const Ray = new Language('ether', (Version.scheme('E') as Standard).create(0, '2027-01-01', 0))
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

    // Stand-ins so the associativity test cases can run end-to-end (real
    // resolution will be wired up later). All `accepts` infix methods log
    // their source column so the test reads the firing order off the
    // trace; the operator's actual associativity is stamped via the
    // `external <left|right>-associative <name>` lines in the fixture.
    .external_method('F', (self, method, args) => {
      method.info('test', `F fired`);
      return method;
    })
    .external_method('x', (self, method, args) => {
      method.info('test', `x@${method.col} fired on F@${self.col ?? '?'} with F@${args.col ?? '?'}`);
      return self;
    }, fn => fn.with('accepts'))
    .external_method('M', (self, method, args) => {
      method.info('test', `M@${method.col} fired on F@${self.col ?? '?'} with F@${args.col ?? '?'}`);
      return self;
    }, fn => fn.with('accepts'))
    .external_method('N', (self, method, args) => {
      method.info('test', `N@${method.col} fired on F@${self.col ?? '?'} with F@${args.col ?? '?'}`);
      return self;
    }, fn => fn.with('accepts'))
    .external_method('X', (self, method, args) => {
      method.info('test', `X@${method.col} fired on F@${self.col ?? '?'} with F@${args.col ?? '?'}`);
      return self;
    }, fn => fn.with('accepts'))
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
    /** Emit the wrongDirection error on the right node. Cases:
     *   - prev is an unresolved forward (in either direction) → the
     *     receiver itself is the real failure; surface "Unresolved <prev>"
     *     instead of a direction-mismatch downstream of a missing name.
     *   - RTL + prev is `</` → no real receiver yet; recurse via _.peek
     *     past further direction markers and emit on the next real token.
     *   - RTL else → emit on resolved (the misplaced method).
     *   - LTR else → emit on prev so the squiggle lands on the source-
     *     order receiver, not on the method that exposed the mismatch. */
    const emitDirectionError = (_: any, resolved: Node): void => {
      const prev = _.program.result;
      const prevForward = prev.forwardRef();
      const direction = _._direction;
      const recvName = prev.string ?? '';

      if (prevForward) {
        prevForward.error('forward ref', prevForward.value.resolution!.message);
      } else if (direction === 'right-to-left' && prev.enabled('direction')) {
        const handler = _.program.runtime._expression!.handle!;
        const recurse = (): Node | undefined => {
          if (_.direction.done()) return undefined;
          const candidate = handler(_);
          if (!candidate || candidate.none) return undefined;
          return candidate.enabled('direction') ? recurse() : candidate;
        };
        const target = _.peek(recurse);
        if (target) target.error('method',
          `Tried to apply \`${resolved.string}\` with \`${target.string ?? ''}\` but \`${resolved.string}\` wasn't flagged as ${direction}.`);
      } else if (direction === 'right-to-left') {
        resolved.error('method', `Found a method \`${resolved.string}\` on \`${recvName}\` but it wasn't flagged as ${direction}.`);
      } else {
        prev.error('method', `Found a method \`${resolved.string}\` on \`${recvName}\` but it wasn't flagged as ${direction}.`);
      }
    };

    /** Direction-agnostic token handler. Reads one token in `_._direction`
     *  (LTR by default, RTL when the parse-root has been flipped to `.rtl`)
     *  and folds it into `_.program.result`. The same function powers both
     *  the outer LTR parse (registered via `E.token`) and the RTL re-walk
     *  triggered by `</`. The only direction-sensitive bit is "behind me"
     *  (whether the previous char was whitespace) — we use `_.behind.peek()`
     *  which flips to `.right` when `.rtl` is set. */
    const handle = (_: any): Node | undefined => {
      let saw_newline = false;
      _.skip_while((ch: string) => {
        if (ch === '\n') saw_newline = true;
        return ch === ' ' || ch === '\n';
      });
      if (saw_newline) {
        const expr_start = _.program.expression_start as Node | undefined;
        if (expr_start && _._direction === 'left-to-right') {
          // Build a synthetic boundary Node anchored one past the
          // expression's last non-whitespace position. Used both as
          // the exclusive walk boundary for the assert and as the
          // rewalk trigger — `[start.begin, trigger.begin)` includes
          // every token in the expression.
          let lastEnd = _.cursor - 1;
          while (lastEnd > 0 && (_.source[lastEnd] === ' ' || _.source[lastEnd] === '\n')) lastEnd--;
          const boundary = new Node(_.program);
          boundary.source_file = expr_start.source_file;
          boundary.cursor = lastEnd + 1;
          boundary.selection = [lastEnd + 1, lastEnd + 1];

          // Walk resolved siblings via `.right.next()` and check for
          // mixed associativity. If only right-assoc methods appear,
          // rewalk RTL so reduction happens right-to-left.
          const kind = expr_start.assert.non_mixed_associativity(boundary);
          if (kind === 'right') _.rewalk(expr_start, boundary, 'right-to-left');
        }
        _.program.commit();
      }
      _.capture_while((ch: string) => ch !== ' ' && ch !== '\n');

      if (_.program.result) {
        _.program.result.realize();
        const prevResult = _.program.result;
        const acceptsArgs = (prevResult.enabled('accepts_program') || prevResult.enabled('accepts'))
                         && _.behind.peek() === ' ';
        if (acceptsArgs) {
          prevResult.debug('test', prevResult.enabled('accepts_program') ? 'accepts_program' : 'accepts');

          (_.value.ctx ?? _.program.runtime.CTX).realize();

          const prev = prevResult;
          const resolved = _.match(_.string, _.value.ctx ?? _.program.runtime.CTX);

          // Per-pair check, no chain on Program, no recursion at settle:
          //   - if `resolved` itself accepts a program, prev's call needs the
          //     eventual inner — build a composition node (`prev ∘ resolved`)
          //     that accepts a program too, so the next pair sees a chainable
          //     result. The composition fires when the leaf finally arrives.
          //   - otherwise `resolved` is the leaf → call prev with it now (which
          //     fires prev's body — `accepts`-flagged composed nodes will fire
          //     their bound infix method here).
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
          return resolved;
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
      const direction: 'left-to-right' | 'right-to-left' = _._direction;
      const f = {
        switchesDirection: !!resolved.value.options['direction'],
        ltr:               resolved.enabled('left-to-right'),
        rtl:               resolved.enabled('right-to-left'),
        acceptsProgram:    resolved.enabled('accepts_program'),
        accepts:           resolved.enabled('accepts'),
      };
      const matchesDirection   = direction === 'right-to-left' ? f.rtl : f.ltr;
      // Anchor candidacy is about *direction position*, not method-ness:
      // a registered method without direction flags (e.g. `test-middle`)
      // can be the anchor that opposite-direction methods bind to.
      const isDirectionFlagged = f.ltr || f.rtl || f.switchesDirection;
      // "exclusive opposite" — has the other direction's flag and not
      // this direction's. Used by the deferred-opposite branch (a single-
      // direction wrong-way token gets stashed; bidir doesn't defer).
      const opposite           = (f.ltr || f.rtl) && !matchesDirection;
      // Method-shaped *and* in the wrong position. A registered method
      // without direction flags AND without `accepts_program` (e.g.
      // `test-middle`) is variable-shaped — it juxtaposes onto the chain
      // just like a forward ref would, and doesn't trigger this error.
      const wrongDirection     = !f.switchesDirection && !matchesDirection
                              && (f.ltr || f.rtl || f.acceptsProgram);

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
        const target: 'left-to-right' | 'right-to-left' = direction === 'right-to-left' ? 'left-to-right' : 'right-to-left';
        _.rewalk(expr_start, resolved, target, resolved);
        _.program.expression_start = resolved;
        return resolved;
      }

      // Defer an opposite-direction method:
      //   - no prev: nothing to consume yet, just stash and wait.
      //   - has prev + accepts_program: prev becomes the method's args (the
      //     `B ∍ A` shape). Reset result so the next non-flagged token
      //     triggers the anchor fold above; expression_start (still pinned
      //     to the original first token) keeps the range start put.
      // Without accepts_program, a prev-bearing opposite token has nowhere
      // for that prev to go — fall through to the wrongDirection error.
      if (opposite && !f.switchesDirection) {
        if (_.program.result === null) return resolved;
        if (f.acceptsProgram) {
          _.program.result = null;
          return resolved;
        }
      }

      if (_.program.result) {
        // When prev / resolved is an unresolved forward, the receiver
        // itself is the real failure — `forwardRef()` returns the actual
        // cursor-bearing forward from the resolution registry so the
        // diagnostic lands on a real source position.
        const prev = _.program.result;
        const prevForward = prev.forwardRef();
        const resolvedForward = resolved.forwardRef();

        // Distinguish seed-based RTL rewalks (anchor fold like `rtlOnly v`)
        // from seedless ones (`</`-triggered like `v bidir w </`): in the
        // seed case prev is the pre-pinned anchor (a fresh forward from
        // _.match, applied=false), so the resolved-side method is the
        // source-earlier failure. In the seedless case prev was built up
        // by save() during the rewalk (a juxtaposition lazy from .call,
        // applied=true) — the rightmost-captured token is the implicit
        // anchor and *its* missing name is what the user is staring at.
        if (f.switchesDirection) {
          _.program.result = resolved.eager.call(prev);
        } else if (matchesDirection) {
          if (resolvedForward && direction === 'right-to-left' && !prev.applied) {
            resolvedForward.error('forward ref', resolvedForward.value.resolution!.message);
          } else if (prevForward) {
            prevForward.error('forward ref', prevForward.value.resolution!.message);
          } else if (f.acceptsProgram) {
            // Mirrors the early-branch composition for accepts_program, but
            // with the direction-bound receiver: prev (the anchor) is bound
            // as `self` *eagerly* — that doubles as the "this method was
            // dispatched as infix" marker the assert filters on. The
            // method then waits for the next juxtaposed token to arrive
            // as `args` (which the early branch will deliver via
            // composed.call(arg)).
            const anchor = prev;
            const m = resolved;
            m.value.self = anchor;
            const composed = new Node(_.program);
            composed.value.encoded = (_self: Node | undefined, _method: Node, args: Node) => {
              return m.eager.call(args);
            };
            composed.value.options['accepts_program'] = 'true';
            _.program.result = composed;
          } else {
            resolved.value.self = prev;
            _.program.result = resolved.eager.call(new Node(_.program, null, null));
          }
        } else if (wrongDirection) {
          emitDirectionError(_, resolved);
        } else if (f.accepts) {
          // `accepts` is a non-directional infix flag: bind prev as the
          // receiver and wait for the next juxtaposed token to arrive as
          // args (which the early branch will deliver via composed.call(arg),
          // firing the underlying method body once). When the rewalk is
          // running RTL (right-associative reduction), swap operands so the
          // body still fires with source-order (left, right) — `prev` is
          // the right-side and `args` is the left-side in RTL.
          //
          // Eagerly bind anchor as self so this matched copy carries the
          // "dispatched as infix" marker (value.self with a real cursor),
          // which `assert.non_mixed_associativity` uses to filter out
          // declarations like `external right-associative x` where x is a
          // leaf, not an operator.
          const isRTL = direction === 'right-to-left';
          const anchor = prev;
          const m = resolved;
          m.value.self = anchor;
          const composed = new Node(_.program);
          composed.value.encoded = (_self: Node | undefined, _method: Node, args: Node) => {
            if (isRTL) m.value.self = args;
            return m.eager.call(isRTL ? anchor : args);
          };
          composed.value.options['accepts'] = 'true';
          _.program.result = composed;
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
      if (f.switchesDirection && _.program.expression_start) {
        const target = resolved.value.options['direction'] as 'left-to-right' | 'right-to-left';
        // Only re-walk when the token actually flips us into a new direction;
        // otherwise we'd loop on every token recapture inside the rewalk.
        if (target !== direction) {
          _.trace('rewalk', `firing ${target} rewalk from ${(_.program.expression_start as any).begin} to ${(resolved as any).begin}`);
          _.rewalk(_.program.expression_start, resolved, target);
        }
      }

      return resolved;
    };

    return E(handle)
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
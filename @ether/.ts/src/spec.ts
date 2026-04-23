import path from "path";
import {Language, Node, Program} from "./language.ts";
import {is_string} from "./lodash.ts";

export const Ray = new Language('ether', 'E.2026v0.D0')
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
    .external_method('external', (self, args) => {
      if (!self.eager.has(args.eager.get('location'))) args.error('external', "Expected method to be externally defined by the runtime, but it wasn't");
      return args;
    })
    // .external_method('ex', null, fn => fn.with('refuse_abstract_interpretation'))
    // .external_method('initializer')
    // .external_method('left-to-right')
    // .external_method('right-to-left')
    // .external_method('left-associative')
    // .external_method('right-associative')
  )
  .context(_ => _
    .external_method('local', (self, args) => self)
  )

  .syntax(E => {
    E.token(_ => {
      _.capture_while(ch => ch === ' ' || ch === '\n')
      if (_.string?.includes('\n')) { 
        _.program.pending.push(_.program.result)
        _.program.result = null
      }
      _.skip()
      _.capture_while(ch => ch !== ' ' && ch !== '\n')

      const resolved = _.match(_.string)

      // if (resolved.value.options['rtl'] && resolved.value.options['left_associative']) {
      //   _.ltr.expression().save()
      // } else if (resolved.value.options['rtl']) {
      //   _.rtl.expression().save()
      // } else {
        resolved.save()
      // }

      //Todo .PROGRAM.PENDING.push needs to happen for the last line as well.
    })

    return E()
  })

  .pass(_ => _
    .ref('std')

    .cd('@ether/$/.ray', _ => _.loadDirectory('.', { recursively: true }))
    // .cd('@ether', _ => _.load('Ether.ray'))
  )

Ray.abstract().exec()
// Ray.backend('llvm').repl()
// Ray.backend('llvm', 'X').build()
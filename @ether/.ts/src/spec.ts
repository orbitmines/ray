import path from "path";
import {Language, Node} from "./language.ts";
import {is_string} from "./lodash.ts";

export const Ray = new Language('ether', 'E.2026v0.D0')
  .extension('.ray')

  .pass(_ => _
    .ref('bootstrap')

    .cd('@ether/$/.ray', _ => _.loadFile('Node'))

    .syntax(E => {
      // const PATTERNED_RULE = E( E(E, '{', E.reinterpet(AT_PASS_2), '}', E).length('>=', 1).freeze(), E.until('=>'), E.block())
      E.patterned_rule = (node: (_: Language) => Node) => E(E(), '{', E().reinterpret('std'), '}', E()).repeats('>=', 1).bind('pattern').freeze().until('=>').block()
        // E.block = E.any(E.block(), E.block('{', '}')) for the languages that want to set things
        // inner .freeze is overridden by .reinterpret,

        // .split the spaces in front of to get the different |/& patterns, skip |/&.
        .interpret(self => node(self.reader.language).external_method(self.pattern.map(x => is_string(x) ? x : UNKNOWN), FORWARD_REF))
        // .interpret is reverted when .reinterpret happens
        // .freeze on rule pattern part, not the body.
        // .buffer on .interpret means buffer effect for next pass.

      return [E(
        [E().goto(E.patterned_rule(_ => _.context()))],
        E().upto('class *').upto('\n').block(_ =>
          [E.goto(E.patterned_rule(_ => _.base()))]
        )
      )]
    })
  )
  //TODO Set class * location on base class.
  .base(_ => _
    .external_method('external', (l, ctx, self, args) =>
      if (!self.has(l, ctx, args.resolve(l, ctx, 'location')()))
        self.error('external', "Expected method to be externally defined by the runtime, but it wasn't");
      return
    )
    // .external_method('initializer')
    // .external_method('left-to-right')
    // .external_method('right-to-left')
    // .external_method('left-associative')
    // .external_method('right-associative')
  )
  .context(_ => _
    .external_method('local', (l, ctx, self, args) => self)
  )

  .syntax(E => {
    E.token(_ => _
      .left.syntax(_.methods.filter(x => x.rtl))
      .right.syntax(_.methods.filter(x => x.ltr))
    )
  })

  .pass(_ => _
    .ref('std')

    .cd('@ether/$/.ray', _ => _.loadDirectory('.', { recursively: true }))
    .cd('@ether', _ => _.load('Ether'))
  )

// Ray.exec()
// Ray.backend('llvm').repl()
// Ray.backend('llvm', 'X').build()
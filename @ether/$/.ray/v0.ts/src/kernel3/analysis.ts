import { Text } from './text.ts';
import { Interpreter, Node, type Piece } from './interpreter.ts';

// What is reported once everything is read: the names a body reads that
// nothing names, rules that were never run looked at once, and `forward`s
// nobody implemented.
export class Analysed extends Interpreter {
  override analyzed(location?: string) {
    const here = (rule: Node) => location === undefined || rule.position?.source.location === location;
    this.hands = new Map();
    for (const [rule, impl] of this.definitions_of()) {
      const names = impl.forward ? undefined : this.handed.get(rule);
      if (names === undefined) continue;
      const head = this.head(rule);
      if (head === undefined) continue;
      let out = this.hands.get(head);
      if (out === undefined) this.hands.set(head, out = new Set());
      for (const name of names) out.add(name);
    }
    for (const [rule, impl] of this.definitions_of()) {
      if (impl.forward || !impl.body || this.ran.has(rule.key!) || this.pending_rewrites.some(([other]) => other === rule)) continue;
      if (!this.owns(impl.body.source) || (location !== undefined && impl.body.source.location !== location)) continue;
      if (!this.first_site(impl.body)) continue;
      const scope = this.definition_scope(impl.closure ?? this.GLOBAL, rule, impl);
      this.quiet++;
      try { this.probe(impl.body, scope); } finally { this.quiet--; }
      for (const missing of this.missing(rule, impl, scope)) this.error(`Unresolved \`${missing.string}\`.`, missing);
    }
    for (const node of this.deferred) {
      const lazy = node.lazy!;
      if (node.value !== undefined || lazy.consumed || this.in_body(lazy.span) || !this.owns(lazy.span.source)) continue;
      if (location !== undefined && lazy.span.source.location !== location) continue;
      this.probe(lazy.span, lazy.frame, { report: true });
    }
    for (const [rule, impl] of this.pending_rewrites) if (here(rule))
      for (const missing of this.missing(rule, impl)) this.error(`Unresolved \`${missing.string}\`.`, missing);
    const scopes = [this.GLOBAL, ...this.frames.values()];
    for (const forward of this.forwards) {
      if (!here(forward)) continue;
      const head = this.head(forward);
      const implemented = head !== undefined && scopes.some(scope =>
        scope.rules.some(rule => rule !== forward && !scope.methods!.get(rule)!.forward && this.head(rule) === head) ||
        ((scope.own(head)?.callable ?? false) && !scope.own(head)!.forward));
      if (!implemented) this.error(`Expected \`${forward.position!.string}\` to be implemented later on (it was declared with \`forward\`), but it never was.`, forward.position);
    }
  }
}

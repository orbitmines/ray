import {Parser, Token, TreeNode} from "./refactor3.ts";
import fs from "fs";

const EMPTY_LINE = Token.regex(/ *\n/);

// If any rule effects any of the previously generated rules (Only those containing {}), it gets reparsed. If two rules are in a loop once, error is thrown?

// If a dependency is not on preceding but on after, speculatively branch to both having and not having it until we can determine the if-statement

const EXPRESSION = Token.any(
  Token.array(
    Token.loop(Token.array(
      Token.optional(Token.any(
        // TODO Any token grammar would be put in here, in order.
        Token.array(Token.string('{'), Token.ref(() => PROGRAM).bind('expression'), Token.string('}')),
        Token.array(Token.string('('), Token.ref(() => PROGRAM).bind('expression'), Token.string(')')),
        Token.array(Token.string('<'), Token.ref(() => PROGRAM).bind('expression'), Token.string('>')),
        Token.array(Token.string('['), Token.ref(() => PROGRAM).bind('expression'), Token.string(']')),
      )),
      Token.arbitrary().bind('substring')
    )),
    // Token.optional(Token.loop(Token.string(' '))),
    Token.optional(Token.array(Token.string(' '), Token.string('('), Token.ref(() => PROGRAM).bind('parameters'), Token.string(')'))),
    Token.any(
      Token.array(Token.string('=>'), Token.ref(() => PROGRAM).bind('block')),
      Token.end()
    )
  )
)

const STATEMENT: Token = Token.array(
  Token.loop(EMPTY_LINE),  // Skip any leading empty lines
  Token.ref(() => EXPRESSION).bind('content'),
  Token.any(Token.string('\n'), Token.end()),
  // Children: each starts with parent_indent + extra_indent
  Token.loop(
    Token.array(
      Token.loop(EMPTY_LINE),  // Skip empty lines between children
      // Match parent's indent (params.indent spaces)
      Token.times(Token.string(' ')).exactly('indent'),
      // Match additional indent (at least 1 space) - this determines child's level
      Token.times(Token.string(' ')).atLeast(1).bind('added'),
      // Recurse with new indent = parent + added
      Token.withParams(
        (ctx, bindings) => ({ indent: ctx.params.indent + bindings.added.count }),
        Token.ref(() => STATEMENT)
      )
    )
  ).bind('children')
);

const PROGRAM = Token.loop(Token.ref(() => STATEMENT)).bind('statements');

const GRAMMAR_DEF = Token.any(
  Token.array(
    Token.loop(Token.array(
      Token.optional(Token.any(
        // TODO Any token grammar would be put in here, in order.
        Token.array(Token.string('{'), Token.ref(() => PROGRAM).bind('expression'), Token.string('}')),
      )),
      Token.arbitrary().bind('substring')
    )),
    Token.any(
      // Token.array(Token.string(' '), Token.string('('), Token.loop(Token.string(' ')), Token.string(')'), Token.arbitrary()),
      Token.array(Token.string('=>').bind('arrow'), Token.arbitrary()),
    )
  )
)
const parser = new Parser(GRAMMAR_DEF, { indent: 0 });

const parseResult = parser.parse(
  // fs.readFileSync('../.ray/Program.ray', 'utf8') +
  // fs.readFileSync('../.ray/Language/String/String.ray', 'utf8') +
  // fs.readFileSync('../.ray/Node.ray', 'utf8')
  // "//{\" \"[], comment: String, \\n?} | /*{\n" +
  // "  {comment: .line#.join(\n\\n\n)}: (indent: \" \"[]{length == previous.indent if previous}?, line: String, \" \"[], \"\\n\"?)[]\n" +
  // "}* => &caller.next.comment = above: &caller.comment, \\n if above, comment //TODO .next here should be on the right level. or use a different method which does it properly. Comment after the current line should be included\n"

  "`{string: String}` => string"
);

//
// const parser2 = new Parser(EXPRESSION)
// console.log('='.repeat(60))
// console.log('`{string: String}` => string')
// const result = parser2.parse(
//   '`"{string: (substring: String, punctuation: ("{", expression: Expression, punctuation: "}") if substring !"\\"⊣)[]}" => string - punctuation\n'
// ) // Doesnt work because it's not string-aware yet
// console.log(result)
// console.log(result.value[0][1][0])

const toTreeNode = (value: any): TreeNode | undefined => {
  const [_emptyLines, content, _term, children] = value;

  const parser = new Parser(EXPRESSION)
  const result = parser.parse(content)
  console.log(content)
  console.log(result)

  return {
    content,
    children: (children || []).map((c: any) => {
      // Each child is: [emptyLines, parentIndent, addedIndent, statementValue]
      const [_childEmptyLines, _parentIndent, _addedIndent, childStatement] = c;
      return toTreeNode(childStatement);
    }).filter((x: any) => x !== undefined),
    // These get filled in during evolution
    type: 'statement',
    bindings: undefined,
    patternText: undefined,
    ruleName: undefined,
  };
}


// Step 2: Convert to tree nodes
const rawStatements = parseResult.bindings.statements || [];
console.log(JSON.stringify(parseResult, null, 2));
// console.log(parseResult)
// const rootNodes: TreeNode[] = rawStatements.map((s: any) => toTreeNode(s)).filter((x: any) => x !== undefined);
// printTree(rootNodes)

import {Parser, printTree, Token, TreeNode} from "./refactor3.ts";
import fs from "fs";

const EMPTY_LINE = Token.regex(/ *\n/);

//TODO If opens with { should go to newline.
const STATEMENT: Token = Token.array(
  Token.loop(EMPTY_LINE),  // Skip any leading empty lines
  Token.arbitrary().bind('content'),
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

const parser = new Parser(PROGRAM, { indent: 0 });

const parseResult = parser.parse(
  fs.readFileSync('../.ray/Program.ray', 'utf8') +
  fs.readFileSync('../.ray/Language/String/String.ray', 'utf8') +
  fs.readFileSync('../.ray/Node.ray', 'utf8')
);

// (1) If it's a loop there should be a dependence on the next iteration of the loop, now it doesnt match properly. See the arbitrary comes after the Optional { match, which should be a boundary it looks for.
// \U{codepoint: Hexadecimal{length == 6}}: Char => codepoint
// {
//   success: true,
//   consumed: 46,
//   value: [ [ [Array] ], null, ' Hexadecimal{length == 6}}: Char ' ],
//   bindings: { substring: '\\U{codepoint:' }
// }
// This should';ve cut off at { and then wrapped around.

// (2) If there's an optional it should see past that and say the token after optional, or atLeast 0 etc... should see the next token as the boundary it's looking for in the example Optional ( * ) is matched and then a => is expected, but it doesn't match.

// (3) I want a way to prettily print the results of a token pattern match, where it's obvious what matched to what. and where the bounded variables are.

// (4) For that pretty print, and separately, I want a way to navigate the matched values more intuitively, right now it's not an intuitive structure. Things like loop and other wrappings shouldnt wrap the value for this structure to navi=gate the result, just interested in the matched groups as long as it's intuitive what's present. Basically I want an AST for the pattern.

const EXPRESSION = Token.any(
  Token.array(
    Token.loop(Token.array(
      Token.optional(Token.array(Token.string('{'), Token.ref(() => PROGRAM).bind('expression'), Token.string('}'))),
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

const parser2 = new Parser(EXPRESSION)
console.log('='.repeat(60))
console.log('`{string: String}` => string')
const result = parser2.parse('`"{string: (substring: String, punctuation: ("{", expression: Expression, punctuation: "}") if substring !"\\"⊣)[]}" => string - punctuation\n') // Doesnt work because it's not string-aware yet
console.log(result)
console.log(result.value[0][1][0])

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
// const rawStatements = parseResult.bindings.statements || [];
// const rootNodes: TreeNode[] = rawStatements.map((s: any) => toTreeNode(s)).filter((x: any) => x !== undefined);
// printTree(rootNodes)

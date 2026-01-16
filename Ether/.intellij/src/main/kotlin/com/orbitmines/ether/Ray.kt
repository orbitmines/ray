package com.orbitmines.ether

import com.intellij.lang.Language
import com.intellij.lexer.LexerBase
import com.intellij.openapi.components.Service
import com.intellij.openapi.editor.DefaultLanguageHighlighterColors
import com.intellij.openapi.editor.colors.TextAttributesKey
import com.intellij.openapi.editor.markup.TextAttributes
import com.intellij.openapi.fileTypes.ExactFileNameMatcher
import com.intellij.openapi.fileTypes.FileTypeManager
import com.intellij.openapi.fileTypes.LanguageFileType
import com.intellij.openapi.fileTypes.SyntaxHighlighterBase.pack
import com.intellij.openapi.fileTypes.SyntaxHighlighterFactory
import com.intellij.openapi.fileTypes.ex.FileTypeManagerEx
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.IconLoader
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.tree.IElementType
import com.intellij.psi.tree.TokenSet
import com.intellij.openapi.options.colors.AttributesDescriptor
import com.intellij.openapi.options.colors.ColorDescriptor
import com.intellij.openapi.options.colors.ColorSettingsPage
import java.awt.Color
import java.awt.Font
import java.util.regex.Pattern
import javax.swing.Icon

object Ray : Language("Ray")

object Icons {
  val FILE: Icon = IconLoader.getIcon("/icons/file.svg", Icons::class.java)
}

class RayColorSettingsPage : ColorSettingsPage {

  override fun getIcon() = Icons.FILE
  override fun getHighlighter() = SyntaxHighlighter()

  override fun getDemoText(): String =
    """
        keyword foo = 42
        "string"
        """.trimIndent()

  override fun getAdditionalHighlightingTagToDescriptorMap(): Map<String, TextAttributesKey> {
    return mapOf(
      "keyword" to SyntaxHighlighter.KEYWORD,
      "string" to SyntaxHighlighter.STRING,
      "number" to SyntaxHighlighter.NUMBER,
      "comment" to SyntaxHighlighter.COMMENT,
      "access" to SyntaxHighlighter.ACCESS,
      "operator" to SyntaxHighlighter.OPERATOR,
      "punctuation" to SyntaxHighlighter.PUNCTUATION,
      "boolean" to SyntaxHighlighter.BOOLEAN,
      "builtin" to SyntaxHighlighter.BUILTIN,
      "class" to SyntaxHighlighter.CLASS_NAME,
      "variable" to SyntaxHighlighter.VARIABLE
    )
  }

  override fun getAttributeDescriptors() = arrayOf(
    AttributesDescriptor("Keyword", SyntaxHighlighter.KEYWORD),
    AttributesDescriptor("String", SyntaxHighlighter.STRING),
    AttributesDescriptor("Number", SyntaxHighlighter.NUMBER),
    AttributesDescriptor("Comment", SyntaxHighlighter.COMMENT),
    AttributesDescriptor("Access", SyntaxHighlighter.ACCESS),
    AttributesDescriptor("Builtin", SyntaxHighlighter.BUILTIN),
    AttributesDescriptor("Boolean", SyntaxHighlighter.BOOLEAN),
    AttributesDescriptor("Class Name", SyntaxHighlighter.CLASS_NAME),
    AttributesDescriptor("Variable", SyntaxHighlighter.VARIABLE),
    AttributesDescriptor("Punctuation", SyntaxHighlighter.PUNCTUATION),
    AttributesDescriptor("Operator", SyntaxHighlighter.OPERATOR)
  )

  override fun getColorDescriptors(): Array<ColorDescriptor> = ColorDescriptor.EMPTY_ARRAY
  //         ColorDescriptor("My Gutter Color", MySyntaxHighlighter.GUTTER_COLOR_KEY, ColorDescriptor.Kind.FOREGROUND)

  override fun getDisplayName(): String = "Ray/Ether"
}

class FileType : LanguageFileType(Ray) {
  override fun getName() = "Ray"
  override fun getDescription() = "Ray/Ether"
  override fun getDefaultExtension() = "ray"
  override fun getIcon() = Icons.FILE
}
class TokenType(debugName: String) : IElementType(debugName, Ray) {
  override fun toString() = "TokenType." + super.toString()
}
object Types {
  val KEYWORD = TokenType("KEYWORD")
  val STRING = TokenType("STRING")
  val NUMBER = TokenType("NUMBER")
  val COMMENT = TokenType("COMMENT")
  val ACCESS = TokenType("ACCESS")
  val OPERATOR = TokenType("OPERATOR")
  val PUNCTUATION = TokenType("PUNCTUATION")
  val BOOLEAN = TokenType("BOOLEAN")
  val BUILTIN = TokenType("BUILTIN")
  val CLASS_NAME = TokenType("CLASS_NAME")
  val VARIABLE = TokenType("VARIABLE")
}

data class Rule(
  val tokenType: IElementType,       // token type is provided directly
  val pattern: Regex,
  var inside: List<Rule>? = null     // optional nested rules
)
data class Token(
  val type: IElementType,
  val tokenStart: Int,
  val tokenEnd: Int
)
class PrismMatcher() {

  fun tokenize(rules: List<Rule>, input: CharSequence, offset: Int = 0, default: IElementType = Types.PUNCTUATION): List<Token> {
    if (input.isEmpty()) return emptyList()

    if (rules.isEmpty()) {
      // If no rules left, treat entire input as a "plain" token
      //TODO Default from inside top-level
      return listOf(Token(default, offset, offset + input.length))
    }

    val currentRule = rules.first()
    val remainingRules = rules.drop(1)

    val tokens = mutableListOf<Token>()
    val matches = currentRule.pattern.findAll(input).toList()

    if (matches.isEmpty()) {
      // No matches for this rule, continue with remaining rules
      return tokenize(remainingRules, input, offset)
    }

    var lastIndex = 0

    for (match in matches) {
      // Recurse on unmatched part before this match using remaining rules
      if (match.range.first > lastIndex) {
        val before = input.substring(lastIndex, match.range.first)
        tokens += tokenize(remainingRules, before, offset + lastIndex)
      }

      // Tokenize this match
      val start = offset + match.range.first
      val end = offset + match.range.last + 1

      if (currentRule.inside != null) {
        tokens += tokenize(currentRule.inside!!, match.value, start, currentRule.tokenType)
      } else {
        tokens += Token(currentRule.tokenType, start, end)
      }

      lastIndex = match.range.last + 1
    }

    // Recurse on any remaining part after the last match
    if (lastIndex < input.length) {
      val after = input.substring(lastIndex)
      tokens += tokenize(remainingRules, after, offset + lastIndex)
    }

    return tokens
  }

}

class PrismLexer(
  private var rules: List<Rule>
) : LexerBase() {

  private var childLexer: PrismLexer? = null

  private var buffer: CharSequence = ""
  private var bufferEnd = 0

  private var tokenStart = 0
  private var tokenEnd = 0
  private var tokenType: IElementType? = null

  private val UNKNOWN = Types.PUNCTUATION

  private var tokens: List<Token> = emptyList()

  override fun start(buffer: CharSequence, startOffset: Int, endOffset: Int, initialState: Int) {
    this.buffer = buffer
    this.tokenStart = startOffset
    this.tokenEnd = startOffset
    this.bufferEnd = endOffset
    this.tokenType = null
    this.childLexer = null
    this.tokens = PrismMatcher().tokenize(rules, buffer)
    advance()
  }

  override fun getState(): Int = 0

  override fun getTokenType(): IElementType? = tokenType

  override fun getTokenStart(): Int = tokenStart

  override fun getTokenEnd(): Int = tokenEnd

  override fun getBufferSequence(): CharSequence = buffer

  override fun getBufferEnd(): Int = bufferEnd

  override fun advance() {
    if (tokenStart >= bufferEnd) {
      tokenType = null
      return
    }

    val token = tokens.firstOrNull { it.tokenStart == tokenStart }!!
    tokenType = token.type
//    println(tokenStart)
//    println(tokenType)

    // Find the first matching rule
    tokenStart = tokenEnd
    tokenEnd = token.tokenEnd
    if (tokenEnd > bufferEnd) tokenEnd = bufferEnd

    // If inside a child lexer, advance it first
//    childLexer?.let { child ->
//      child.advance()
//      if (child.tokenType == null) {
//        childLexer = null // child finished
//      } else {
//        tokenType = child.tokenType
//        // Map child offsets back to parent buffer
//        tokenStart += child.tokenStart
//        tokenEnd = tokenStart + (child.tokenEnd - child.tokenStart)
//        return
//      }
//    }
//
//
////    if (match != null) {
////      val (rule, m) = match
////      val matchEnd = tokenStart + m.value.length
////
//////      if (rule.inside != null) {
//////        // Nested rules: start a child lexer on the matched text
//////        val child = PrismLexer(rule.inside!!)
//////        child.start(m.value, 0, m.value.length, 0)
//////        child.advance()
//////        childLexer = child
//////
//////        tokenType = child.tokenType ?: rule.tokenType
//////        tokenStart = matchStart
//////        tokenEnd = matchEnd
//////      } else {
////        tokenType = rule.tokenType
////        tokenEnd = matchEnd
//////      }
////
////    } else {
//      // No rule matched, fallback to single character token
//      tokenEnd = tokenStart + 1
//      tokenType = UNKNOWN
////    }
  }
}


class SyntaxHighlighter : com.intellij.openapi.fileTypes.SyntaxHighlighter {

  override fun getHighlightingLexer(): PrismLexer {
    val rayTxtRules: List<Rule> = listOf(
      // COMMENT
      Rule(
        tokenType = Types.COMMENT,
        pattern = Regex("(//[^\n]*)|(/\\*.*\\*/)", RegexOption.DOT_MATCHES_ALL)
      ),

      // STRING with nested interpolation
      Rule(
        tokenType = Types.STRING,
        pattern = Regex("\"(?:\\\\.|\\{[^{}]*\\}|(?!\\{)[^\\\\\"])*\""),
//        inside = listOf(
//          Rule(
//            tokenType = Types.STRING,
//            pattern = Regex("\\{[^{}]*\\}"),
//            inside = listOf(
//              Rule(
//                tokenType = Types.PUNCTUATION,
//                pattern = Regex("^\\{|\\}\$")
//              ),
//              Rule(
//                tokenType = Types.STRING,
//                pattern = Regex("[\\s\\S]+"),
//                inside = null // placeholder for recursion
//              )
//            )
//          )
//        )
      ),

      // NUMBER
      Rule(
        tokenType = Types.NUMBER,
        pattern = Regex("-?\\b\\d+(?:\\.\\d+)?(?:e[+-]?\\d+)?\\b", RegexOption.IGNORE_CASE)
      ),

      // BP5-TEXT-MUTED
      Rule(
        tokenType = Types.OPERATOR,
        pattern = Regex("""(\\)|(\bas\b)|#|@(?=\s)|%|--|\+\+|\*\*=?|&&=?|x?\|\|=?|[!=]==|<<=?|>>>?=?|x?[-+*/%^!=<>]=?|\.{3}|\?\?=?|\?\.?|~/""")
      ),

      // PUNCTUATION
      Rule(
        tokenType = Types.PUNCTUATION,
        pattern = Regex("""[{}\],()]|=>|:|[|&.⸨⸩]|[⊣⊢∙⊙]""")
      ),

      // KEYWORD
      Rule(
        tokenType = Types.KEYWORD,
        pattern = Regex("""\b(?:this|static|end|global|local|persistent|class|namespace|dynamically|external|internal|none|confidential|managed|assert|read|write|execute)\b""")
      ),

      // ACCESS
      Rule(
        tokenType = Types.ACCESS,
        pattern = Regex("""@[a-zA-Z0-9_]+""")
      ),

      // BUILTIN
      Rule(
        tokenType = Types.BUILTIN,
        pattern = Regex("""\b(?:goto|branch|if|elsif|else|return|theorem|not|in|assume|boolean|Number|String)\b""")
      ),

      // BOOLEAN
      Rule(
        tokenType = Types.BOOLEAN,
        pattern = Regex("""\b(?:false|true)\b""")
      ),

      // CLASS-NAME
      Rule(
        tokenType = Types.CLASS_NAME,
        pattern = Regex("""[A-Z][A-Za-z0-9_]+""")
      ),

      // VARIABLE
      Rule(
        tokenType = Types.VARIABLE,
        pattern = Regex("""[a-z0-9_]+""")
      )
    )

    // Find the STRING -> INTERPOLATION -> EXPRESSION rule
//    val stringRule = rayTxtRules.first { it.tokenType == Types.STRING }
//    val interpolationRule = stringRule.inside!!.first { it.tokenType == Types.STRING }
//    val expressionRule = interpolationRule.inside!!.first { it.tokenType == Types.STRING }
//
//// Set recursion
//    expressionRule.inside = rayTxtRules

    return PrismLexer(rayTxtRules)
  }

  override fun getTokenHighlights(tokenType: IElementType) = when(tokenType) {
    Types.KEYWORD -> pack(KEYWORD)
    Types.STRING -> pack(STRING)
    Types.NUMBER -> pack(NUMBER)
    Types.COMMENT -> pack(COMMENT)
    Types.ACCESS -> pack(ACCESS)
    Types.BUILTIN -> pack(BUILTIN)
    Types.BOOLEAN -> pack(BOOLEAN)
    Types.CLASS_NAME -> pack(CLASS_NAME)
    Types.VARIABLE -> pack(VARIABLE)
    Types.PUNCTUATION -> pack(PUNCTUATION)
    Types.OPERATOR -> pack(OPERATOR)
    else -> emptyArray()
  }

  companion object {
    val KEYWORD = TextAttributesKey.createTextAttributesKey(
      "MYLANG_KEYWORD",
//      DefaultLanguageHighlighterColors.KEYWORD
      TextAttributes(Color(108, 103, 131), null, null, null, Font.PLAIN)
    )
    val NUMBER = TextAttributesKey.createTextAttributesKey(
      "MYLANG_NUMBER",
//      DefaultLanguageHighlighterColors.NUMBER
      TextAttributes(Color(255, 204, 153), null, null, null, Font.PLAIN)
    )
    val STRING = TextAttributesKey.createTextAttributesKey(
      "MYLANG_STRING",
//      DefaultLanguageHighlighterColors.STRING
      TextAttributes(Color(255, 204, 153), null, null, null, Font.PLAIN)
    )
    val COMMENT = TextAttributesKey.createTextAttributesKey(
      "MYLANG_COMMENT",
//      DefaultLanguageHighlighterColors.LINE_COMMENT
      TextAttributes(Color(108, 103, 131), null, null, null, Font.PLAIN)
    )
    val OPERATOR = TextAttributesKey.createTextAttributesKey(
      "MYLANG_OPERATOR",
//      DefaultLanguageHighlighterColors.OPERATION_SIGN
      TextAttributes(Color(171, 179, 191), null, null, null, Font.BOLD)
    )
    val ACCESS = TextAttributesKey.createTextAttributesKey(
      "MYLANG_ACCESS",
//      TextAttributes(Color(108, 103, 131), null, null, null, Font.BOLD)
      TextAttributes(Color(255, 204, 153), null, null, null, Font.PLAIN)

    )
    val BUILTIN = TextAttributesKey.createTextAttributesKey(
      "MYLANG_BUILTIN",
//      DefaultLanguageHighlighterColors.PREDEFINED_SYMBOL
      TextAttributes(Color(154, 134, 253), null, null, null, Font.PLAIN)
    )
    val BOOLEAN = TextAttributesKey.createTextAttributesKey(
      "MYLANG_BOOLEAN",
//      DefaultLanguageHighlighterColors.KEYWORD
      TextAttributes(Color(255, 204, 153), null, null, null, Font.PLAIN)
    )
    val CLASS_NAME = TextAttributesKey.createTextAttributesKey(
      "MYLANG_CLASS_NAME",
//      DefaultLanguageHighlighterColors.CLASS_NAME
      TextAttributes(Color(154, 134, 253), null, null, null, Font.PLAIN)
    )
    val VARIABLE = TextAttributesKey.createTextAttributesKey(
      "MYLANG_VARIABLE",
      TextAttributes(Color(196, 185, 254), null, null, null, Font.PLAIN)
    )
    val PUNCTUATION = TextAttributesKey.createTextAttributesKey(
      "MYLANG_PUNCTUATION",
      TextAttributes(Color(108, 103, 131), null, null, null, Font.PLAIN)
    )
  }
}
class SyntaxHighlighterFactory : SyntaxHighlighterFactory() {
  override fun getSyntaxHighlighter(
    project: Project?,
    virtualFile: VirtualFile?
  ) = SyntaxHighlighter()
}

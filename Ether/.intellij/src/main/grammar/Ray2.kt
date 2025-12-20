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
  val IDENTIFIER = TokenType("IDENTIFIER")
  val BAD_CHARACTER = TokenType("BAD_CHARACTER")

  val COMMENTS = TokenSet.create(COMMENT)
  val STRINGS = TokenSet.create(STRING)
  val NUMBERS = TokenSet.create(NUMBER)
  val KEYWORDS = TokenSet.create(KEYWORD)
  val BOOLEANS = TokenSet.create(BOOLEAN)
  val BUILTINS = TokenSet.create(BUILTIN)
  val CLASS_NAMES = TokenSet.create(CLASS_NAME)
  val VARIABLES = TokenSet.create(VARIABLE)
  val OPERATORS = TokenSet.create(OPERATOR)
  val PUNCTUATION_SET = TokenSet.create(PUNCTUATION)
}
class Lexer : LexerBase() {

  private lateinit var buffer: CharSequence
  private var start = 0
  private var end = 0
  private var pos = 0
  private var tokenType: IElementType? = null

  override fun start(
    buffer: CharSequence,
    startOffset: Int,
    endOffset: Int,
    initialState: Int
  ) {
    this.buffer = buffer
    this.start = startOffset
    this.pos = startOffset
    this.end = endOffset
    advance()
  }

  override fun getState() = 0
  override fun getTokenType() = tokenType
  override fun getTokenStart() = start
  override fun getTokenEnd() = pos
  override fun getBufferSequence() = buffer
  override fun getBufferEnd() = end

  override fun advance() {
    if (pos >= end) {
      tokenType = null
      return
    }

    start = pos
    val c = buffer[pos]

    when {
      c.isWhitespace() -> {
        pos++
        while (pos < end && buffer[pos].isWhitespace()) pos++
        tokenType = com.intellij.psi.TokenType.WHITE_SPACE
      }

      c.isLetter() -> {
        pos++
        while (pos < end && buffer[pos].isLetterOrDigit()) pos++
        val text = buffer.subSequence(start, pos).toString()
        tokenType =
          if (text in setOf("let", "fn", "if", "else"))
            Types.KEYWORD
          else
            Types.IDENTIFIER
      }

      c.isDigit() -> {
        pos++
        while (pos < end && buffer[pos].isDigit()) pos++
        tokenType = Types.NUMBER
      }

      c == '"' -> {
        pos++
        while (pos < end && buffer[pos] != '"') pos++
        if (pos < end) pos++
        tokenType = Types.STRING
      }

      c == '/' && pos + 1 < end && buffer[pos + 1] == '/' -> {
        pos += 2
        while (pos < end && buffer[pos] != '\n') pos++
        tokenType = Types.COMMENT
      }

      "+-*/=".contains(c) -> {
        pos++
        tokenType = Types.OPERATOR
      }

      else -> {
        pos++
        tokenType = Types.BAD_CHARACTER
      }
    }
  }
}

class SyntaxHighlighter : com.intellij.openapi.fileTypes.SyntaxHighlighter {

  override fun getHighlightingLexer() = Lexer()

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
      DefaultLanguageHighlighterColors.KEYWORD
    )
    val NUMBER = TextAttributesKey.createTextAttributesKey(
      "MYLANG_NUMBER",
//      DefaultLanguageHighlighterColors.NUMBER
      TextAttributes(Color(255, 204, 153), null, null, null, Font.PLAIN)
    )
    val STRING = TextAttributesKey.createTextAttributesKey(
      "MYLANG_STRING",
      DefaultLanguageHighlighterColors.STRING
    )
    val COMMENT = TextAttributesKey.createTextAttributesKey(
      "MYLANG_COMMENT",
//      DefaultLanguageHighlighterColors.LINE_COMMENT
      TextAttributes(Color(108, 103, 131), null, null, null, Font.PLAIN)
    )
    val OPERATOR = TextAttributesKey.createTextAttributesKey(
      "MYLANG_OPERATOR",
      DefaultLanguageHighlighterColors.OPERATION_SIGN
    )
    val ACCESS = TextAttributesKey.createTextAttributesKey(
      "MYLANG_ACCESS",
      DefaultLanguageHighlighterColors.KEYWORD
    )
    val BUILTIN = TextAttributesKey.createTextAttributesKey(
      "MYLANG_BUILTIN",
      DefaultLanguageHighlighterColors.PREDEFINED_SYMBOL
    )
    val BOOLEAN = TextAttributesKey.createTextAttributesKey(
      "MYLANG_BOOLEAN",
      DefaultLanguageHighlighterColors.KEYWORD
    )
    val CLASS_NAME = TextAttributesKey.createTextAttributesKey(
      "MYLANG_CLASS_NAME",
      DefaultLanguageHighlighterColors.CLASS_NAME
    )
    val VARIABLE = TextAttributesKey.createTextAttributesKey(
      "MYLANG_VARIABLE",
      DefaultLanguageHighlighterColors.LOCAL_VARIABLE
    )
    val PUNCTUATION = TextAttributesKey.createTextAttributesKey(
      "MYLANG_PUNCTUATION",
      DefaultLanguageHighlighterColors.OPERATION_SIGN
    )
  }
}
class SyntaxHighlighterFactory : SyntaxHighlighterFactory() {
  override fun getSyntaxHighlighter(
    project: Project?,
    virtualFile: VirtualFile?
  ) = SyntaxHighlighter()
}

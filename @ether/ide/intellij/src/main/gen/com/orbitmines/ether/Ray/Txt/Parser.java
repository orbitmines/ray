// This is a generated file. Not intended for manual editing.
package com.orbitmines.ether.Ray.Txt;

import com.intellij.lang.PsiBuilder;
import com.intellij.lang.PsiBuilder.Marker;
import static generated.GeneratedTypes.*;
import static com.intellij.lang.parser.GeneratedParserUtilBase.*;
import com.intellij.psi.tree.IElementType;
import com.intellij.lang.ASTNode;
import com.intellij.psi.tree.TokenSet;
import com.intellij.lang.PsiParser;
import com.intellij.lang.LightPsiParser;

@SuppressWarnings({"SimplifiableIfStatement", "UnusedAssignment"})
public class Parser implements PsiParser, LightPsiParser {

  public ASTNode parse(IElementType t, PsiBuilder b) {
    parseLight(t, b);
    return b.getTreeBuilt();
  }

  public void parseLight(IElementType t, PsiBuilder b) {
    boolean r;
    b = adapt_builder_(t, b, this, null);
    Marker m = enter_section_(b, 0, _COLLAPSE_, null);
    r = parse_root_(t, b);
    exit_section_(b, 0, m, t, r, true, TRUE_CONDITION);
  }

  protected boolean parse_root_(IElementType t, PsiBuilder b) {
    return parse_root_(t, b, 0);
  }

  static boolean parse_root_(IElementType t, PsiBuilder b, int l) {
    return file(b, l + 1);
  }

  /* ********************************************************** */
  // [a-zA-Z_][a-zA-Z0-9_]*
  public static boolean IDENTIFIER(PsiBuilder b, int l) {
    if (!recursion_guard_(b, l, "IDENTIFIER")) return false;
    boolean r;
    Marker m = enter_section_(b, l, _NONE_, IDENTIFIER, "<identifier>");
    r = IDENTIFIER_0(b, l + 1);
    r = r && IDENTIFIER_1(b, l + 1);
    exit_section_(b, l, m, r, false, null);
    return r;
  }

  // [a-zA-Z_]
  private static boolean IDENTIFIER_0(PsiBuilder b, int l) {
    if (!recursion_guard_(b, l, "IDENTIFIER_0")) return false;
    consumeToken(b, A_ZA_Z_);
    return true;
  }

  // [a-zA-Z0-9_]
  private static boolean IDENTIFIER_1(PsiBuilder b, int l) {
    if (!recursion_guard_(b, l, "IDENTIFIER_1")) return false;
    consumeToken(b, A_ZA_Z0_9_);
    return true;
  }

  /* ********************************************************** */
  // 'let'
  public static boolean KEYWORD(PsiBuilder b, int l) {
    if (!recursion_guard_(b, l, "KEYWORD")) return false;
    boolean r;
    Marker m = enter_section_(b, l, _NONE_, KEYWORD, "<keyword>");
    r = consumeToken(b, "let");
    exit_section_(b, l, m, r, false, null);
    return r;
  }

  /* ********************************************************** */
  // [0-9]+
  public static boolean NUMBER(PsiBuilder b, int l) {
    if (!recursion_guard_(b, l, "NUMBER")) return false;
    Marker m = enter_section_(b, l, _NONE_, NUMBER, "<number>");
    consumeToken(b, "0-9");
    exit_section_(b, l, m, true, false, null);
    return true;
  }

  /* ********************************************************** */
  // NUMBER | IDENTIFIER
  public static boolean expr(PsiBuilder b, int l) {
    if (!recursion_guard_(b, l, "expr")) return false;
    boolean r;
    Marker m = enter_section_(b, l, _NONE_, EXPR, "<expr>");
    r = NUMBER(b, l + 1);
    if (!r) r = IDENTIFIER(b, l + 1);
    exit_section_(b, l, m, r, false, null);
    return r;
  }

  /* ********************************************************** */
  // statement*
  static boolean file(PsiBuilder b, int l) {
    if (!recursion_guard_(b, l, "file")) return false;
    while (true) {
      int c = current_position_(b);
      if (!statement(b, l + 1)) break;
      if (!empty_element_parsed_guard_(b, "file", c)) break;
    }
    return true;
  }

  /* ********************************************************** */
  // KEYWORD IDENTIFIER "=" expr
  public static boolean statement(PsiBuilder b, int l) {
    if (!recursion_guard_(b, l, "statement")) return false;
    boolean r;
    Marker m = enter_section_(b, l, _NONE_, STATEMENT, "<statement>");
    r = KEYWORD(b, l + 1);
    r = r && IDENTIFIER(b, l + 1);
    r = r && consumeToken(b, "=");
    r = r && expr(b, l + 1);
    exit_section_(b, l, m, r, false, null);
    return r;
  }

}

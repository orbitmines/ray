// This is a generated file. Not intended for manual editing.
package generated;

import com.intellij.psi.tree.IElementType;
import com.intellij.psi.PsiElement;
import com.intellij.lang.ASTNode;
import generated.psi.impl.*;

public interface GeneratedTypes {

  IElementType EXPR = new IElementType("EXPR", null);
  IElementType IDENTIFIER = new IElementType("IDENTIFIER", null);
  IElementType KEYWORD = new IElementType("KEYWORD", null);
  IElementType NUMBER = new IElementType("NUMBER", null);
  IElementType STATEMENT = new IElementType("STATEMENT", null);

  IElementType A_ZA_Z0_9_ = new IElementType("a-zA-Z0-9_", null);
  IElementType A_ZA_Z_ = new IElementType("a-zA-Z_", null);

  class Factory {
    public static PsiElement createElement(ASTNode node) {
      IElementType type = node.getElementType();
      if (type == EXPR) {
        return new RayExprImpl(node);
      }
      else if (type == IDENTIFIER) {
        return new RayIdentifierImpl(node);
      }
      else if (type == KEYWORD) {
        return new RayKeywordImpl(node);
      }
      else if (type == NUMBER) {
        return new RayNumberImpl(node);
      }
      else if (type == STATEMENT) {
        return new RayStatementImpl(node);
      }
      throw new AssertionError("Unknown element type: " + type);
    }
  }
}

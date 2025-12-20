// This is a generated file. Not intended for manual editing.
package generated.psi.impl;

import java.util.List;
import org.jetbrains.annotations.*;
import com.intellij.lang.ASTNode;
import com.intellij.psi.PsiElement;
import com.intellij.psi.PsiElementVisitor;
import com.intellij.psi.util.PsiTreeUtil;
import static generated.GeneratedTypes.*;
import com.intellij.extapi.psi.ASTWrapperPsiElement;
import com.orbitmines.ether.psi.*;

public class RayStatementImpl extends ASTWrapperPsiElement implements RayStatement {

  public RayStatementImpl(@NotNull ASTNode node) {
    super(node);
  }

  public void accept(@NotNull RayVisitor visitor) {
    visitor.visitStatement(this);
  }

  @Override
  public void accept(@NotNull PsiElementVisitor visitor) {
    if (visitor instanceof RayVisitor) accept((RayVisitor)visitor);
    else super.accept(visitor);
  }

  @Override
  @NotNull
  public RayIdentifier getIdentifier() {
    return findNotNullChildByClass(RayIdentifier.class);
  }

  @Override
  @NotNull
  public RayKeyword getKeyword() {
    return findNotNullChildByClass(RayKeyword.class);
  }

  @Override
  @NotNull
  public RayExpr getExpr() {
    return findNotNullChildByClass(RayExpr.class);
  }

}

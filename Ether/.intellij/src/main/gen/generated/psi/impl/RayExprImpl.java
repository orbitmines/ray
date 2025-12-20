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

public class RayExprImpl extends ASTWrapperPsiElement implements RayExpr {

  public RayExprImpl(@NotNull ASTNode node) {
    super(node);
  }

  public void accept(@NotNull RayVisitor visitor) {
    visitor.visitExpr(this);
  }

  @Override
  public void accept(@NotNull PsiElementVisitor visitor) {
    if (visitor instanceof RayVisitor) accept((RayVisitor)visitor);
    else super.accept(visitor);
  }

  @Override
  @Nullable
  public RayIdentifier getIdentifier() {
    return findChildByClass(RayIdentifier.class);
  }

  @Override
  @Nullable
  public RayNumber getNumber() {
    return findChildByClass(RayNumber.class);
  }

}

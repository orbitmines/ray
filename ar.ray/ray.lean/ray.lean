def add1 (n : Nat) : Nat := n + 1
#eval add1 6

theorem onePlusOneIsTwo : 1 + 1 = 2 := by
  decide

def main : IO Unit :=
  IO.println "H"

#eval main

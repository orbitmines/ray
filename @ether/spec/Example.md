# Example
*The Ether Library pipeline.*

The purpose of the Ether Library, is to make accessible to its Ray language (and by extension others), the code written in all other languages. Interoperability between languages.

*The way this is achieved is by going through all the abstraction layers down to the assembly layer, then decompile back up to the Ray programming language, and extract the grammar of some other language.*

---

Let's start with the following example pipeline our abstraction would go through: 

Interpreted `Toy Language` -> `c++` -> `ELF` (linux executable) -> `Assembly`

We effectively have a chained pipeline of languages we might want to extract semantics from, inject into and extract libraries made from it. 

And say we wanted to extract a Type in the Ray programming language which adhered to this Toy Language, and the libraries written in this Toy Language. 

```ray
ToyLanguage := /* The type inferred from a binary */
```

Here's how we'd extract it, starting by defining our Toy Language:

### Toy Language.

All this does is it allows us to write programs like this, with the primitives being `GOTO .. IF ..`, a `label\`, and `fn` + `fn()`:

```toylang
return and(1 1)

fn nand a b
  GOTO a_one IF a
  return 1

 a_one\
  GOTO both_one IF b
  return 1

 both_one\
  return 0

fn not a
  return nand(a a) 

fn and a b
  return not(and(a b))
```

The Toy Language interpreter would look something like this:

```cpp

```

### High-level overview of the pipeline

Before we start compiling, we need some machinery. We need to know the base language: an Assembly language. We need to know the format it's in (another language), called `ELF`.

You could of course achieve this in a similar way: Just write a backend for each compiler and each version in existance! That's of course not really practical, we want to systematically interpret languages. So, here goes, at least we must have that base language!

```ray
@ELF := /* Code in Example.ray */
@ASM := /* Code in Example.ray */
```

Now that we that, we can interpret our c++ ELF binary:

```ray
ToyLanguage.elf: @ELF = @./Example.o
```

Because an equivalence exists between ELF and ASM (ELF contains ASM), we can just cast it to ASM:

```ray
ToyLanguage.asm: @ASM = ToyLanguage.elf
```

We can now deploy the machinary of the Ray programming language, it uses its own compiler, which are things like this:

```ray
Compiler := {
  default := {
    {a} + 0 => a
    {a} * 1 => a
  }
}
```

to say what are equivalent programs. A compiler is effectively nothing but that. It may involve turning the entire program in a completely different structure, but that structure is again just a language to interpret and apply more compiler (rewrite) rules to.

(TODO) From that it defines automatic isomorphisms: Just a rewrite rule which goes in the opposite way automatically: if `{a} + 0 => a`, then we can reverse that arrow and `a => {a} + 0`! That is not that useful for this example in particular, but this will be useful for recover certain kinds of abstractions.

This again exists in the language as an equivalence to a Program, which is a language Ray understands:

```ray
@ASM := class (/* ... */) => {
  as (=== Program) => /* ... */
}
```

Which allows us to once again cast to Program:

```ray
ToyLanguage.ray: Program := ToyLanguage.asm
```

By default it will now have the structure of assembly, it is not yet converted to a nice high level program. In order to turn on our decompiler, we define which compiler optimizations apply:

```
with O = Compiler.decompiler // O is the selected compiler optimizations.
ToyLanguage.ray: Program := ToyLanguage.asm
```

This will no to the best of its ability rewrite the assembly into a program with nice abstractions, this is something that will be continuously improved upon.

You can also pass your own rewrite rules to the compiler, and it will no attempt to make those equivalences for you, like our toy language example a GOTO/RETURN pattern meaning a nand:

```
with O = Compiler.decompiler + {
  nand (a, b) => {
    goto a_one if a
    return 1

   a_one\
    goto both_one if b
    return 1

   both_one\
    return 0
  }
}
ToyLanguage.ray: Program := ToyLanguage.asm
```

Note that it will do the inverse of what is written here, it will turn the matched gotos, into a NAND.

### Decompiling the Toy Language Interpreter

Ok that's all well and good, but what does the actual structure and output look like. Let's give it a go:

```
ToyLanguage.ray: Program := @./Example.o with O = Compiler.decompiler
```
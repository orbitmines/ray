# Blockers

What keeps the `$` projects from running on the seed (`language.ts`), found 2026-10-19 by loading each of the projects
made from `$/.asm` (`ELF`, `PE`, `MachO`, `XML`, `RISCVOpcodes`, `Sail`, `SLEIGH`, `ASL`, `XED`, `RISCV`, `MOS6502`,
`Z80`, `A64`, `X86`) after the bootstrap. Each loads in 47–60 s; none of its asserts holds. The older projects fail the same
way (`CRC32.project.ray`: every assert fails). Each blocker has the error the seed gives, where it shows, and the check that
says it is gone.

Run one project: from `@ether/v0.ts`, with a file `inc.ray` holding `include @<absolute path>.project.ray`,
`RAY_NOCACHE=1 node --import tsx src/language.ts -nv --test --threads 1 --target wasm --level=none ../ray/bootstrap/.entrypoint.ray3 inc.ray`.

A PASS is not yet evidence: an assert over a name nothing reads can pass vacuously (`X86.spelled(…)` passes while `@xed`
never loads). Read a pass together with the lines before it.

## 1. A project's dependencies are not read

- `nothing reads `@sleigh``, `@xed`, `@sail`, `@riscvopcodes`, `@xml`, `@asl`, `@elf`: the dependency lines at the top of a
  project (Design §15.1: `@X` is the project `@ether/$/X`).
- Shows in: `RISCV`, `MOS6502`, `Z80`, `A64`, `X86`, and the older projects (`Gzip`'s `@deflate`, `PNG`'s `@zlib` and `@ether/ui`).
- Check: `RISCV.project.ray`'s first two lines read, and `RISCV.Encodings` is read by `RISCVOpcodes`.

## 2. A level written as a sum of rules is not read

- `nothing in what it is read on reads `+ {``: `Compiler.none + { … }`, a level made of the empty one and a block of rules
  (Design §20.1).
- Shows in: `Sail.expressions`, `SLEIGH.patterns` and `SLEIGH.pcode`, `ASL.statements`; so nothing reads Sail, SLEIGH or
  ASL text as Ray.
- Check: `Sail.Expression.read(`0b0010 @ 0x1`) == ₂00100001` (SAIL5).

## 3. A rule led by a typed hole is not read

- `nothing reads `elf: ELF``, `pe: PE`, `macho: MachO`, `opcodes: RISCVOpcodes`, `datafiles: XED`, `document: XML`: the
  `static level := { {x: T} => … }` every language has; the same in `CRC32` (`writing: Language.Writing`).
- Check: `$.elf === ELF` (ELF12), and `CRC32.project.ray`'s `written` reads.

## 4. Generic statics are not read

- `nothing in what it is read on reads `<wide``: a static with type parameters, `static Field<n, little> := …`,
  `static Header<wide, little> := class (…)` (Design §7.4: generics are partial arguments).
- Shows in: `ELF`, `MachO`, `PE` (`Wide<wide>`), `RISCVOpcodes` (`Line<arguments: …>`).
- Check: `ELF.read(file).header.machine == 0x3E` (ELF2).

## 5. A language's header does not read bytes

- `a value is not of the type it is given to: {type}` at the class line of `ELF`, `PE`, `MachO`; `nothing reads
  `read(…)``, `X.read(…)` of a `class: Language` given bytes or text.
- Needs headers that read (Selfhosting.md §2: `text as T`, in order, dependent): literals, typed places, `T[]{length ==
  field}`, `(…) if c`, `<-T` (least significant byte first), `*` (the rest, kept).
- Check: ELF1 and ELF6 (read, and written back as read); `RISCVOpcodes` ROP1.

## 6. A test of a long byte list runs out of its memory

- `took more than 32 MB of new memory in this test (what it reads makes more and more): stopped`, on the asserts holding
  a 124–212 byte file (`ELF`, `PE`, `MachO`, `X86`'s last).
- Check: ELF's two `assert { file := […] … }` blocks finish under the per-test limit, or the limit says why it is right.

## 7. Smaller ones, seen once

- `nothing is labelled `taken`` in `PE.project.ray:65`: `taken := 0` and `taken += 1` in a `.( … )` block (`run`).
- `nothing reads `Language.named(".exe")``: Gzip's `Language.named(".gz")` fails the same way.
- `nothing in what it is read on reads `> is Diagnostic``: `x as T<arguments: …> is Diagnostic` (RISCVOpcodes ROP9).
- `nothing reads `run(cpu, until: 0x0603, steps: 30)`` and `step(cpu)`: a static method called bare from an assert in
  its own class (MOS6502 MOS22, Z80 ZED12).
- `nothing reads `X``: an accessor `X[n, width]` called inside `cpu.( … )` (A64 AA10); waits on 2 (ASL's machine).

## Not blockers

- The descriptions the instruction sets are made from are locations at pinned commits
  (`@https://raw.githubusercontent.com/…`); reading one errs until mirrors and caches exist (Design §15.1). Arm's A64
  release is fetched by hand into `.ether/external/arm` (Arm's licence).

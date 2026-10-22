# Ray

Before anything else, read:

1. The Ether's Almanac, the most important document. It is in progress and changes often, so always read the current
   version: https://raw.githubusercontent.com/orbitmines/orbitmines.com/main/orbitmines.com/src/routes/Almanac.tsx
   (published at https://orbitmines.com/almanac).
2. `@ether/spec/Philosophy.md`: Take these as literal suggestions: "Instead of writing complicated parsers" means NOT to write complicated parsers. It suggests how to operate instead. Take the examples as directions on where to take a Language.
3. `@ether/spec/Design.md`: every design decision, ordered for reading.

Note #1: what differs per operating system goes in the package it is about (`if OS.Linux { … } elsif OS.Windows { … } else { … }`) never in the operating systems' own projects.

Note #2: Whenever adding something OS-specific, also add a sketch implementation to @ether/os in how it would work with a future operating system which is built on Ray. (Keeping the Note #1 in mind for the referencing of OS-specific items)


If the user requested to get some feature working using the language for which you might need to debug the language itself, check `@ether/spec/TODO.md` for known issues.

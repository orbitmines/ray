# Ray

Before anything else, read:

1. The Ether's Almanac, the most important document. It is in progress and changes often, so always read the current
   version: https://raw.githubusercontent.com/orbitmines/orbitmines.com/main/orbitmines.com/src/routes/Almanac.tsx
   (published at https://orbitmines.com/almanac).
2. `@ether/spec/Philosophy.md`: Take these as literal suggestions: "Instead of writing complicated parsers" means NOT to write complicated parsers. It suggests how to operate instead. Take the examples as directions on where to take a Language.
3. `@ether/spec/Design.md`: every design decision, ordered for reading.

Note: what differs per operating system goes in the package it is about (`if OS.Linux { … } elsif OS.Windows { … } else { … }`
in `$/Keyboard`, `@ether/filesystem`, `@ether/timezone`, …), never in the operating systems' own projects (`$/Linux`,
`$/Windows`, `$/MacOS`, `$/Browser`, `@ether/os`), which only say what each one is.

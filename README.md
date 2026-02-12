# The Ray Programming Language & Ether

> [!NOTE]
> This is still a work in progress. Relevant progress is documented in this repo and [here](https://github.com/orbitmines/archive/blob/main/projects/Writing%20-%202025.%20A%20Universal%20Language.md)

---
<div align="center">

![header](./docs/header.svg)

[![OrbitMines Discord](https://img.shields.io/discord/1055502602365845534.svg?label=Discord&logo=Discord&colorB=7289da&style=for-the-badge)](https://discord.orbitmines.com)

</div>

## What is this?

This thing is, in essence, a programming language (Ray) and an IDE (Ether), which together act as a theorem prover, version control system, database and rendering engine. Though to me, most importantly, it is here as infrastructure. Infrastructure for the design and implementation of a [different category of (programming) interfaces](https://orbitmines.com/archive/2024-02-orbitmines-as-a-game-project).

---

- If you prefer **text**, see [Ether's Almanac](https://orbitmines.com/almanac): *Your handbook for anything Ether, Ray & OrbitMines*, or more generally my/OrbitMines writing can be found [here](https://orbitmines.com).

- If you prefer **video**, see [<TODO; Make a stream to explain the project better](), or more generally my streams can be found here: [youtube.com/@FadiShawki/streams](https://www.youtube.com/@FadiShawki/streams).

- If you prefer **code**, see [/Ether](Ether), or more generally my/OrbitMines code can be found here [github.com/orbitmines](https://github.com/orbitmines/).

- If you prefer discussions on **Discord**: [discord.orbitmines.com](https://discord.orbitmines.com).

---

## Local setup

```shell
curl -fsSL https://ether.orbitmines.com/install.sh | bash
```

- Install language support for [IntelliJ](https://plugins.jetbrains.com/plugin/29452-ether) [VS Code] (TODO)


There are several alternative ways of installing Ray & Ether:
- Download the appropriate installer from [GitHub Releases](https://github.com/orbitmines/ray/releases)
- Open Ether in your browser @ [ether.orbitmines.com](https://ether.orbitmines.com)

- Or compile from source
  ```shell
  git clone git@github.com:orbitmines/ray.git
  ```

  ```shell
  cd ray && ./install.sh --compile
  ```
  
  ```shell
  ether
  ```

---

## The Ray Programming Language
*snippets from [2025 Progress Update: Towards a Universal Language](https://orbitmines.com/archive/towards-a-universal-language/)*

I'll start this excursion from the perspective of a new text-based programming language. Though this project intends to step away from the limitations of the text file, all programming infrastructure relies on it. A move away from it, will require additional infrastructure. Even if this is achieved, being able to express as much as possible in a traditional text-based format will be beneficial. Though there will be design features which are simply not translatable to a purely text-based programming language.

...

Since they are castable to boolean, you can call functions accepting a boolean with them:

```ray
s (x: boolean) => x ? "Y" : "N"
s(false & true) // "Y" & "N"
s(boolean) // "Y" | "N"
```

...

We might have a type requirement of one of the methods on the number, take the length of the number for instance, which in this case would be two. We'd check for that simply with:

```ray
Binary{length == 2}
```

...

An example of this sort of type, pattern can be seen in how IPv6 is implemented. Where there are two complications to a valid address: (1) a sequence of zero segments can be compressed with '::' and (2) an IPv4 address might be embedded in them. Making a valid address something like `::ffff:0.0.0.0` or `64:ff9b::`.

```ray
class IPv6 <
  (left: Segment[]).join(":")?,
  zero_compression: "::" (? if !defined_segments.empty),
  (right: Segment[]).join(":")?,
  (":", embedded_ipv4: IPv4)?

  defined_segments: Segment[] =>
    left, right, embedded_ipv4 as Binary

  dynamically assert defined_segments.length (zero_compression
    ? < NUMBER_OF_SEGMENTS - 1 // '-1' Because: The symbol "::" MUST NOT be used to shorten just one 16-bit 0 field. (https://datatracker.ietf.org/doc/html/rfc5952#section-4.2.2)
    : == NUMBER_OF_SEGMENTS
  )
  // When there is an alternative choice in the placement of a "::", the longest run of consecutive 16-bit 0 fields MUST be shortened (https://datatracker.ietf.org/doc/html/rfc5952#section-4.2.3)
  dynamically assert left & right ~= 0[] -- .length <= number_of_compressed_segments if zero_compression
  // When the length of the consecutive 16-bit 0 fields are equal, the first sequence of zero bits MUST be shortened. (https://datatracker.ietf.org/doc/html/rfc5952#section-4.2.3)
  dynamically assert left ~= 0[] -- .length != number_of_compressed_segments if zero_compression

  static NUMBER_OF_SEGMENTS = 8
  static SEGMENT_LENGTH = 16

  static Segment = Hexadecimal{length <= 4}
```

[... continue reading](https://orbitmines.com/archive/towards-a-universal-language/)
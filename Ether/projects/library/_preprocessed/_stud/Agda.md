---
GitHub:
  - https://github.com/agda/agda
Website:
  - https://wiki.portal.chalmers.se/agda/pmwiki.php
nLab: https://ncatlab.org/nlab/show/Agda
Wikipedia: https://en.wikipedia.org/wiki/Agda_(programming_language)
Zulip Chat: https://agda.zulipchat.com/
IRC: irc.libera.chat#agda
Mailing List:
  - https://lists.chalmers.se/mailman/listinfo/agda
  - https://lists.chalmers.se/mailman/listinfo/agda-dev
Related:
  - "[[Homotopy Type Theory (HoTT)]]"
  - "[[Cubical Type Theory]]"
  - "[[Dependent Type Theory]]"
  - "[[Modal Type Theory]]"
---

- [ ] [introduction to programming language theory using the proof assistant Agda](https://plfa.github.io/)
	- found through [[Kenichi Asai]]'s github

- [ ] HoTT -> Agda (https://github.com/hott/hott-agda/ , https://github.com/HoTT/M-types, https://github.com/favonia/homotopy, https://github.com/dlicata335/hott-agda/)

---

The treeless syntax is intended to be used as input for the compiler backends.

---
#### Sources
[[Haskell -> Agda]]
Epic -> Agda
JavaScript -> Agda

#### Targets
[[Agda -> UniMath]]
[[Agda]] -> [[1lab]]

---

### Agda-flat
[[Modal Type Theory]]


### Cubical Agda
[[Cubical Type Theory]]

[[1lab]]

---
##### People
- [[Guillaume Brunerie]]
- [[Ulf Norell]]
- [[Jesper Cockx]]

---

##### Install

Pre-built packages

```shell
sudo apt-get install agda agda-mode
```

---
or...

https://agda.readthedocs.io/en/latest/getting-started/installation.html

- [[Glasgow Haskell Compiler (GHC)#Install]]
- [[Emacs#Install]]

```shell
apt-get install zlib1g-dev libncurses5-dev
```

```shell
cabal update
cabal install Agda
```

If -`lgmp` is missing (https://stackoverflow.com/questions/21603772/usr-bin-ld-cannot-find-lgmp)
```shell
sudo apt-get install libgmp3-dev
```

```shell
agda-mode setup
```
```shell
agda-mode compile
```

---

#### History
- [Hönan Agda](https://www.youtube.com/watch?v=oKUscEWPVAM) - lol


![[Agda_(programming_language).pdf]]
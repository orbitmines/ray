# ray
One ray to rule them all, one ray to find them, One ray to bring them all, and in the darkness bind them.

![header](./header.png)

## What is this?, What is OrbitMines?, What are Rays?

A simple way of phrasing this, is that the concept of a (hyper-/)'Vertex', (hyper-/)'Edge', (hyper-/)'Graph', (hyper-/)'Rule', (hyper-/)'Tactic', (hyper-/)..., (hyper-/)'Rewrite' are merged into one thing: a [Ray](./rays/ray.py). It handles surrounding context, ignorances, equivalences, ..., differentiation (And if it cannot, then it offers a way of implementing it for all of the above). 

Most importantly, it is here as infrastructure. Infrastructure for the design and implementation of a different category of (programming) interfaces.

- If you prefer **text**, see [2023-12-31. On Orbits, Equivalence and Inconsistencies](https://orbitmines.com/papers/on-orbits-equivalence-and-inconsistencies), or more generally my/OrbitMines writing can be found here: [orbitmines.com/profiles/fadi-shawki](https://orbitmines.com/profiles/fadi-shawki).


- If you prefer **audio-visual mumblings**, see [2024-01-04. What is OrbitMines?, Implementing Aleks Kissinger's Chyp and maybe looking at Tinygrad](https://www.youtube.com/watch?v=O6v_gzlI1kY), or more generally my streams can be found here: [youtube.com/@FadiShawki/streams](https://www.youtube.com/@FadiShawki/streams).


- If you prefer **archaic symbolics: i.e. code**, see [ray.py](./rays/ray.py), or more generally my/OrbitMines code can be found here [github.com/orbitmines](https://github.com/orbitmines/).


- If you prefer discussions on **Discord**: [discord.orbitmines.com](https://discord.orbitmines.com).


- TODO: ~~Or if prefer smashing your keyboard till there's something interesting on the screen. See a first implementation of this *explorational interface*: [orbitmines.com/explorer/github.com/akissinger/chyp](https://orbitmines.com/explorer/github.com/akissinger/chyp).~~

---

## Where is OrbitMines going with this? - i.e. Future inquiries

Check out everything I've made public regarding this here: [GitHub Issues](https://github.com/orbitmines/orbitmines.com/issues) or equivalently, check the Discord channels grouped under the name: [Fractals of the Galaxy](https://discord.com/channels/1055502602365845534/1114584997702156388).

---

### Some general notes about this project

> [!IMPORTANT]
> Anything in this directory should be considered as deprecated. It is merely used as the initial (crude) bootstrap for OrbitMines. And will surely be replaced at some point - it is not (yet) meant as a formal spec.

> [!WARNING]
> No proper security audit has yet been done on its current iteration.

> [!WARNING]
> No proper performance optimizations have been done on its current iteration.

---

### Local setup

TODO
    
---

## JavaScript Interface Examples

**This is just preliminary, I'll change this later**

> [!WARNING]
> Reasoning backwards, what should the JavaScript interface look like?

- [ ] Applying a function on a Ray (vertex/initial/terminal) ; then go inside, insde can again be a vertex/initial/terminal on each vertex, apply on those.

---

Let's take logic gates as an example? - and maybe logic with different equiv func? - Like switching between true/false on each check?

```ts
import Ray from '@orbitmines/rays';

const initial = Ray.boolean().orbit().size(2);
const terminal = Ray.boolean().orbit().size(2);


// TODO: Compiles to a sequence of traversal checks?, and setting ops?, and arbitrary many of them make up a program.

```

---

## Latest Writing
https://orbitmines.com/papers/on-orbits-equivalence-and-inconsistencies/
![2023.on-orbits-equivalence-and-inconsistencies-thumbnail.jpeg](./orbitmines.com/public/papers/on-orbits-equivalence-and-inconsistencies/images/thumbnail/3840x2160.jpeg)

---

## License Magic

I'm not convinced putting licenses on the repo's in the usual case is anything other than *Minecraft servers putting "Not affiliated with Mojang" in their stores* just because everyone else does it. But here: after doing absolutely no research into the international ramifications: [LICENSE](./LICENSE) a license for those who like to look at them. Try to reason to what that applies in this repository, obviously that doesn't cover everything not made by me or other contributions to OrbitMines or something. Just put a reference to me or this project somewhere if it's remotely interesting to you.
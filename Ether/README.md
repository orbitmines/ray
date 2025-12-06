# [Ether](https://github.com/orbitmines/ray/) Instance Directory
*Belongs to a single character: Player or NPC.*

- `/.ray.txt` *These files are automatically loaded into the Ray language runtime, as a standard library.*
- `/.[LANGUAGE]` *Represent language/library/runtime packages which are supported by The Ether.*
- `/Ether.ray.txt` *Ether executable, loaded after the `/.ray.txt` directory when running an instance.*
- `/#` *Represents World data*
- `/@` *Represents Character data*
- `/%` *Represents any version history kept which is not Character/World-specific*


- `/entrypoint(.*)?.ray.txt` *Different character entrypoints, the default `/entrypoint.ray.txt` is for this character.*


- `/.ray` *Reserved for a future language*
- `/Ether.ray` *Reserved for a future language*


- Any other directories here are put there by the character or their host, and are optionally considered downloadable packages by other characters.
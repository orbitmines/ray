# [Ether](https://github.com/orbitmines/ray/) Instance Directory
*Belongs to a single character: Player or NPC.*

- `/.ray` *These files are automatically loaded into the Ray language runtime, as a standard library.*
- `/.[LANGUAGE]` *Represent language/library/runtime packages which are supported by The Ether.*
- `/Ether.ray` *Ether executable, loaded after the `/.ray` directory when running an instance.*
- `/#` *Represents World data*
- `/@` *Represents Character data*
- `/%` *Represents any version history kept which is not Character/World-specific*


- `/projects` *Internal project files not yet assigned a package directory*


- `/entrypoint(.*)?.ray` *Different character entrypoints, the default `/entrypoint.ray` is for this character.*


- Any other directories here are put there by the character or their host, and are optionally considered downloadable packages by other characters.
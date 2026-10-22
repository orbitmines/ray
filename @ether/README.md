# [Ether](https://github.com/orbitmines/ray/) Instance Directory
*Belongs to a single character: Player or NPC.*

- `/ray` *These files are automatically loaded into the Ray language runtime.*
- `/$/{NAME}.project.ray` *Represent external language/library/runtime projects they are scoped to `"@{NAME.lower_case}"`: Reserved user directories.*
- `.project.ray`: Identifier that this directory is a separate project.
- `.entrypoint.[TARGET].ray` *First file loaded in a `TARGET` environment*
- `/Ether.ray` *Ether executable, loaded after the `/ray` directory when running an instance.*
- `/#` *Represents World data*
- `/@` *Represents Character data*
- `/%` *Represents any version history kept which is not Character/World-specific*

- Any other directories here are put there by the character or their host, and are optionally considered downloadable projects by other characters.
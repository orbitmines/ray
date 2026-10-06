# Ether.ray for Neovim

Language support for Ray in Neovim 0.12 or later, through the language server that `ray --lsp` serves.

It registers the `ray` filetype for `*.ray` files and enables the `ray` language server. Install `ray` first (see the [root README](../../../README.md#local-setup)); it is looked up on `PATH`, then in `$ETHER_HOME/bin` (default `~/.ether/bin`).

When the project holds a language definition (a `!language` project, such as `@ether/ray` in a checkout of orbitmines/ray), its directory is given to `--lsp` and the server reads that language instead of its own.

## Install

With [lazy.nvim](https://github.com/folke/lazy.nvim):

```lua
{
  'orbitmines/ray',
  config = function(plugin)
    vim.opt.rtp:append(plugin.dir .. '/@ether/ide/nvim')
    vim.cmd.runtime('plugin/ray.lua')
  end,
}
```

Without a plugin manager, add `@ether/ide/nvim` of a ray checkout to your `runtimepath`:

```lua
vim.opt.rtp:append('/path/to/ray/@ether/ide/nvim')
```

## Configure

Override any part of the server config with `vim.lsp.config`; `cmd_env`, `cmd_cwd` and `detached` are passed to `ray --lsp`:

```lua
vim.lsp.config('ray', { capabilities = require('cmp_nvim_lsp').default_capabilities() })
```

Set `vim.g.ray_executable` to use a `ray` other than the one found on `PATH` or in `$ETHER_HOME/bin`.

Set `vim.g.ray_lsp = false` before the plugin loads to get only the filetype and enable the server yourself.

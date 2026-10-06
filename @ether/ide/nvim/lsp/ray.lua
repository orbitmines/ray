local LANGUAGE_DIRECTORY = vim.fs.joinpath('@ether', 'ray')

local function is_language(dir)
  local file = io.open(vim.fs.joinpath(dir, '.project.ray'), 'r')
  if not file then return false end
  local first = file:read('*l') or ''
  file:close()
  return first:find('!language', 1, true) ~= nil
end

local function find_language(start)
  if is_language(start) then return start end
  for dir in vim.fs.parents(vim.fs.joinpath(start, '.')) do
    local candidate = vim.fs.joinpath(dir, LANGUAGE_DIRECTORY)
    if is_language(candidate) then return candidate end
  end
  return nil
end

local function ray_executable()
  if vim.g.ray_executable then return vim.fn.expand(vim.g.ray_executable) end
  local found = vim.fn.exepath('ray')
  if found ~= '' then return found end
  local ether_home = vim.env.ETHER_HOME or vim.fs.joinpath(vim.uv.os_homedir(), '.ether')
  local installed = vim.fs.joinpath(ether_home, 'bin', 'ray')
  if vim.fn.executable(installed) == 1 then return installed end
  return 'ray'
end

return {
  cmd = function(dispatchers, config)
    local root = config.root_dir or vim.uv.cwd()
    local command = { ray_executable(), '--lsp' }
    local language = find_language(root)
    if language then table.insert(command, language) end
    return vim.lsp.rpc.start(command, dispatchers, {
      cwd = config.cmd_cwd or root,
      env = config.cmd_env,
      detached = config.detached,
    })
  end,
  filetypes = { 'ray' },
  root_markers = { '.git', '.project.ray' },
}

if vim.g.loaded_ray then return end
vim.g.loaded_ray = true

vim.filetype.add({ extension = { ray = 'ray' } })

vim.api.nvim_create_autocmd('FileType', {
  pattern = 'ray',
  callback = function()
    vim.bo.commentstring = '// %s'
  end,
})

if vim.g.ray_lsp == false then return end

if vim.fn.has('nvim-0.12') == 0 then
  vim.notify('Ray: the language server needs Neovim 0.12 or later', vim.log.levels.WARN)
  return
end

vim.lsp.enable('ray')

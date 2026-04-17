const Ray = new Language3('Ray')
  .extension('.ray')

  .cd('@ether/.ray')
    .load('Node')
    .loadDirectory('.', { recursively: true })
  .cd('@ether')
    .load('Ether')

  .grammar()
    .dynamic()
    .case()

  .objects()
    .baseClass()



Ray.exec()
Ray.backend('llvm').repl()
Ray.backend('llvm', 'X').build()
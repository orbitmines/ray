import { registerRegistryAdapter, registerVCSAdapter } from './adapter.js';

// -- Registry adapters (19) --
registerRegistryAdapter('npm', async () => {
  const { NpmAdapter } = await import('./npm.js');
  return new NpmAdapter();
});

registerRegistryAdapter('pypi', async () => {
  const { PyPIAdapter } = await import('./pypi.js');
  return new PyPIAdapter();
});

registerRegistryAdapter('crates-io', async () => {
  const { CratesIoAdapter } = await import('./crates-io.js');
  return new CratesIoAdapter();
});

registerRegistryAdapter('maven', async () => {
  const { MavenAdapter } = await import('./maven.js');
  return new MavenAdapter();
});

registerRegistryAdapter('nuget', async () => {
  const { NuGetAdapter } = await import('./nuget.js');
  return new NuGetAdapter();
});

registerRegistryAdapter('rubygems', async () => {
  const { RubyGemsAdapter } = await import('./rubygems.js');
  return new RubyGemsAdapter();
});

registerRegistryAdapter('go', async () => {
  const { GoAdapter } = await import('./go.js');
  return new GoAdapter();
});

registerRegistryAdapter('hackage', async () => {
  const { HackageAdapter } = await import('./hackage.js');
  return new HackageAdapter();
});

registerRegistryAdapter('hex', async () => {
  const { HexAdapter } = await import('./hex.js');
  return new HexAdapter();
});

registerRegistryAdapter('pub-dev', async () => {
  const { PubDevAdapter } = await import('./pub-dev.js');
  return new PubDevAdapter();
});

registerRegistryAdapter('cpan', async () => {
  const { CpanAdapter } = await import('./cpan.js');
  return new CpanAdapter();
});

registerRegistryAdapter('cran', async () => {
  const { CranAdapter } = await import('./cran.js');
  return new CranAdapter();
});

registerRegistryAdapter('packagist', async () => {
  const { PackagistAdapter } = await import('./packagist.js');
  return new PackagistAdapter();
});

registerRegistryAdapter('cocoapods', async () => {
  const { CocoaPodsAdapter } = await import('./cocoapods.js');
  return new CocoaPodsAdapter();
});

registerRegistryAdapter('conda', async () => {
  const { CondaAdapter } = await import('./conda.js');
  return new CondaAdapter();
});

registerRegistryAdapter('opam', async () => {
  const { OpamAdapter } = await import('./opam.js');
  return new OpamAdapter();
});

registerRegistryAdapter('clojars', async () => {
  const { ClojarsAdapter } = await import('./clojars.js');
  return new ClojarsAdapter();
});

registerRegistryAdapter('luarocks', async () => {
  const { LuaRocksAdapter } = await import('./luarocks.js');
  return new LuaRocksAdapter();
});

registerRegistryAdapter('nimble', async () => {
  const { NimbleAdapter } = await import('./nimble.js');
  return new NimbleAdapter();
});

// -- VCS adapters (3) --
registerVCSAdapter('GitHub', async () => {
  const { GitHubAdapter } = await import('./github.js');
  return new GitHubAdapter();
});

registerVCSAdapter('GitLab', async () => {
  const { GitLabAdapter } = await import('./gitlab.js');
  return new GitLabAdapter();
});

registerVCSAdapter('Bitbucket', async () => {
  const { BitbucketAdapter } = await import('./bitbucket.js');
  return new BitbucketAdapter();
});

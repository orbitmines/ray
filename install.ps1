# Installs Ether (`ether`, with the aliases `ray` and `orbitmines`) for the current user, from PowerShell or cmd.
#
#   powershell -c "irm https://ether.orbitmines.com/install.ps1 | iex"      the latest release, for this platform
#   & ([scriptblock]::Create((irm https://ether.orbitmines.com/install.ps1))) -Version 0.1.1-E2027.0A.1
#   .\install.ps1 -Compile                                                  compiled from this checkout (needs Deno)
#
# Windows PowerShell 5.1 and PowerShell 7 (also on macOS and Linux). In bash, use install.sh.
# Through `irm | iex` options come from the environment: ETHER_HOME, ETHER_VERSION, ETHER_FROM, ETHER_NO_MODIFY_PATH.

param(
  [string] $From = $env:ETHER_FROM,
  [string] $Version = $env:ETHER_VERSION,
  [string] $EtherHome = $(if ($env:ETHER_HOME) { $env:ETHER_HOME } else { Join-Path $HOME '.ether' }),
  [switch] $NoModifyPath = [bool] $env:ETHER_NO_MODIFY_PATH,
  [switch] $Compile,
  [switch] $Uninstall,
  [switch] $Help
)

# Its own scope: through `iex` nothing (preferences, strict mode, functions) is left behind in the caller's session.
& {
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
Set-StrictMode -Version 2.0

$Repository = if ($env:ETHER_REPOSITORY) { $env:ETHER_REPOSITORY } else { 'orbitmines/ray' }
$Name = 'ether'
$Aliases = @('ray', 'orbitmines')
$Entry = '@ether/.ray/v0.ts/src/language.ts'
$Config = '@ether/.ray/v0.ts/deno.npm.json'
$Includes = @('LICENSE', '@ether/.ray/v0', '@ether/.ray/v0.ts/javascript.o.ray')
$Marker = '# Added by the Ether installer'

if ($Help) {
  if ($PSCommandPath) { Get-Content $PSCommandPath -TotalCount 8 | ForEach-Object { $_ -replace '^# ?', '' } }
  Write-Host "Options: -From <url|dir> -Version <version> -EtherHome <dir> -NoModifyPath -Compile -Uninstall"
  return
}

$OnWindows = ($PSVersionTable.PSVersion.Major -le 5) -or $IsWindows

function Get-Target {
  $arch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()
  if ($OnWindows) {
    if ($arch -ne 'X64') { Write-Warning "No Windows build for $arch; using x86_64 (runs under emulation on Windows on ARM)." }
    return 'x86_64-pc-windows-msvc'
  }
  $cpu = switch ($arch) { 'X64' { 'x86_64' } 'Arm64' { 'aarch64' } default { throw "Unsupported architecture: $arch" } }
  if ($IsMacOS) { return "$cpu-apple-darwin" }
  return "$cpu-unknown-linux-gnu"
}

function Get-Executable([string] $target, [string] $name) { if ($target -like '*windows*') { "$name.exe" } else { $name } }
function Get-Archive([string] $target) { if ($target -like '*windows*') { "$Name-$target.exe" } else { "$Name-$target.tar.gz" } }

function Get-ReleaseFile([string] $source, [string] $file, [string] $dir) {
  $destination = Join-Path $dir $file
  if ($source -match '^https?://') {
    if ($PSVersionTable.PSVersion.Major -le 5) { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 }
    try { Invoke-WebRequest -UseBasicParsing -Uri "$source/$file" -OutFile $destination; return $true } catch { return $false }
  }
  $local = Join-Path $source $file
  if (-not (Test-Path -LiteralPath $local)) { return $false }
  Copy-Item -LiteralPath $local -Destination $destination
  return $true
}

function New-TemporaryDirectory {
  $dir = Join-Path ([System.IO.Path]::GetTempPath()) ("ether-" + [System.Guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $dir | Out-Null
  $dir
}

function Get-Release([string] $source, [string] $target) {
  $file = Get-Archive $target
  $work = New-TemporaryDirectory
  Write-Host "Downloading $file from $source ..."
  if (-not (Get-ReleaseFile $source $file $work)) { throw "Couldn't get $file from $source (is there a release for ${target}?)" }
  if (Get-ReleaseFile $source 'SHA256SUMS' $work) {
    $line = Get-Content (Join-Path $work 'SHA256SUMS') | Where-Object { $_ -match " $([regex]::Escape($file))$" } | Select-Object -First 1
    if (-not $line) { throw "SHA256SUMS has no entry for $file" }
    $expected = ($line -split ' ')[0]
    $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $work $file)).Hash.ToLower()
    if ($expected -ne $actual) { throw "Checksum mismatch for ${file}: expected $expected, got $actual" }
  } else {
    Write-Warning "No SHA256SUMS next to $file; not verified."
  }
  if ($file -like '*.exe') { Move-Item -Force -LiteralPath (Join-Path $work $file) -Destination (Join-Path $work (Get-Executable $target $Name)) }
  else { tar -xzf (Join-Path $work $file) -C $work; if ($LASTEXITCODE -ne 0) { throw "Couldn't unpack $file" } }
  $work
}

function Invoke-Compile([string] $target) {
  $root = $PSScriptRoot
  if (-not $root -or -not (Test-Path -LiteralPath (Join-Path $root $Entry))) { throw "-Compile needs a checkout of $Repository (run .\install.ps1 from inside it)" }
  if (-not (Get-Command deno -ErrorAction SilentlyContinue)) { throw "-Compile needs Deno (https://deno.com): irm https://deno.land/install.ps1 | iex" }
  $work = New-TemporaryDirectory
  $arguments = @('compile', '-A', '--no-check', '--config', $Config, '--quiet') + ($Includes | ForEach-Object { '--include', $_ }) + @('--target', $target, '--output', (Join-Path $work (Get-Executable $target $Name)), $Entry)
  Write-Host "Compiling $Name for $target ..."
  Push-Location $root
  try { & deno @arguments; if ($LASTEXITCODE -ne 0) { throw "Compiling for $target failed" } } finally { Pop-Location }
  $work
}

function Install-Executable([string] $dir, [string] $target) {
  $bin = Join-Path $EtherHome 'bin'
  $main = Get-Executable $target $Name
  New-Item -ItemType Directory -Force -Path $bin | Out-Null
  Copy-Item -Force -LiteralPath (Join-Path $dir $main) -Destination (Join-Path $bin $main)
  if (-not $OnWindows) { chmod 755 (Join-Path $bin $main) }
  if (-not $OnWindows -and $IsMacOS) { codesign --force --sign - (Join-Path $bin $main) 2>$null }
  foreach ($alias in $Aliases) {
    $link = Join-Path $bin (Get-Executable $target $alias)
    Remove-Item -Force -LiteralPath $link -ErrorAction SilentlyContinue
    # Windows: a hard link (symbolic links need administrator rights there); elsewhere a symbolic link.
    if ($OnWindows) {
      try { New-Item -ItemType HardLink -Path $link -Target (Join-Path $bin $main) | Out-Null }
      catch { Copy-Item -LiteralPath (Join-Path $bin $main) -Destination $link }
    } else { New-Item -ItemType SymbolicLink -Path $link -Target $main | Out-Null }
  }
  Write-Host "Installed $(Join-Path $bin $main) (and $($Aliases -join ', '))"
}

function Get-ProfileFile {
  if ($OnWindows) { return $null }
  $config = if ($env:XDG_CONFIG_HOME) { $env:XDG_CONFIG_HOME } else { Join-Path $HOME '.config' }
  Join-Path (Join-Path $config 'powershell') 'profile.ps1'
}

function Add-ToPath {
  $bin = Join-Path $EtherHome 'bin'
  if ($OnWindows) {
    # The user PATH: cmd, PowerShell, Git Bash and everything else started from now on.
    $path = [Environment]::GetEnvironmentVariable('Path', 'User')
    $entries = @(if ($path) { $path -split ';' | Where-Object { $_ } })
    if ($entries -notcontains $bin) {
      [Environment]::SetEnvironmentVariable('Path', (($entries + $bin) -join ';'), 'User')
      Write-Host "Added $bin to your user PATH."
    }
  } else {
    # PowerShell elsewhere reads its own profile; install.sh covers the other shells.
    $profileFile = Get-ProfileFile
    New-Item -ItemType Directory -Force -Path (Split-Path $profileFile) | Out-Null
    if (-not ((Test-Path -LiteralPath $profileFile) -and (Select-String -SimpleMatch -Quiet -Pattern $Marker -LiteralPath $profileFile))) {
      Add-Content -LiteralPath $profileFile -Value @('', $Marker, "if (-not ((`$env:PATH -split ':') -contains '$bin')) { `$env:PATH = '${bin}:' + `$env:PATH }")
      Write-Host "Added $bin to PATH in $profileFile"
    }
  }
  $separator = [System.IO.Path]::PathSeparator
  if (($env:PATH -split [regex]::Escape($separator)) -notcontains $bin) { $env:PATH = "$bin$separator$env:PATH" }
}

function Remove-FromPath {
  $bin = Join-Path $EtherHome 'bin'
  if ($OnWindows) {
    $path = [Environment]::GetEnvironmentVariable('Path', 'User')
    if ($path) { [Environment]::SetEnvironmentVariable('Path', (($path -split ';' | Where-Object { $_ -and $_ -ne $bin }) -join ';'), 'User') }
    return
  }
  $profileFile = Get-ProfileFile
  if (-not (Test-Path -LiteralPath $profileFile)) { return }
  $lines = @(Get-Content -LiteralPath $profileFile)
  $kept = New-Object System.Collections.Generic.List[string]
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -eq $Marker) { if ($kept.Count -gt 0 -and $kept[$kept.Count - 1] -eq '') { $kept.RemoveAt($kept.Count - 1) }; $i++; continue }
    $kept.Add($lines[$i])
  }
  if (@($kept | Where-Object { $_.Trim() }).Count -gt 0) { Set-Content -LiteralPath $profileFile -Value $kept; return }
  Remove-Item -Force -LiteralPath $profileFile
  $profileDir = Split-Path $profileFile
  if (-not (Get-ChildItem -Force -LiteralPath $profileDir)) { Remove-Item -Force -LiteralPath $profileDir }
}

function Uninstall-Ether {
  $bin = Join-Path $EtherHome 'bin'
  foreach ($command in @($Name) + $Aliases) { foreach ($file in @($command, "$command.exe")) { Remove-Item -Force -LiteralPath (Join-Path $bin $file) -ErrorAction SilentlyContinue } }
  foreach ($dir in @($bin, $EtherHome)) { if ((Test-Path -LiteralPath $dir) -and -not (Get-ChildItem -Force -LiteralPath $dir)) { Remove-Item -Force -LiteralPath $dir } }
  Remove-FromPath
  Write-Host "Removed $Name from $bin and PATH."
}

if ($Uninstall) { Uninstall-Ether; return }

$target = Get-Target
if ($Compile) { $dir = Invoke-Compile $target }
else {
  if (-not $From) {
    $From = if ($Version) { "https://github.com/$Repository/releases/download/v$($Version.TrimStart('v'))" } else { "https://github.com/$Repository/releases/latest/download" }
  }
  $dir = Get-Release $From $target
}
Install-Executable $dir $target
Remove-Item -Recurse -Force -LiteralPath $dir
if (-not $NoModifyPath) { Add-ToPath }

$main = Join-Path (Join-Path $EtherHome 'bin') (Get-Executable $target $Name)
$installed = & $main --version
if ($LASTEXITCODE -ne 0) { throw "The installed $main doesn't run" }
Write-Host ""
Write-Host "Ether $installed is installed. Open a new terminal (cmd, PowerShell, ...) and run: $Name (or $($Aliases -join ' or '))"
}

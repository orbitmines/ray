#!/usr/bin/env bash
#
# Installs Ether (`ether`, with the aliases `ray` and `orbitmines`) for the current user.
#
#   curl -fsSL https://ether.orbitmines.com/install.sh | bash        the latest release, for this platform
#   ./install.sh --compile                                           compiled from this checkout, for this platform
#   ./install.sh --compile <target> | all [--output <dir>]           compiled for other platforms (not installed)
#
# Linux, macOS and Windows (Git Bash, MSYS2, Cygwin, WSL). On Windows outside of bash: install.ps1.
# Run with --help for every option.

set -euo pipefail

REPOSITORY="${ETHER_REPOSITORY:-orbitmines/ray}"
ETHER_HOME="${ETHER_HOME:-$HOME/.ether}"
NAME="ether"
ALIASES="ray orbitmines"
TARGETS="x86_64-unknown-linux-gnu aarch64-unknown-linux-gnu x86_64-apple-darwin aarch64-apple-darwin x86_64-pc-windows-msvc"
ENTRY='@ether/$/.ray/v0.ts/src/kernel3/language.ts'
INCLUDES=('LICENSE' '@ether/$/.ray/v0')
MARKER="# Added by the Ether installer"

usage() {
  cat <<EOF
Installs Ether: \`$NAME\`, with the aliases \`${ALIASES// /\` and \`}\`.

Usage: install.sh [options]

  (no options)             Download the latest release for this platform and install it.
  --compile [target]       Compile from this checkout (needs Deno) instead. Without a target, or with
                           \`native\`, for this platform, and installed. With a target, or \`all\`, only built.
  --output <dir>           Where --compile <target>|all puts the archives (default: ./dist).
  --from <url|dir>         Install from these release files instead of GitHub's latest release.
  --version <version>      Install this release (e.g. 0.1.1) instead of the latest.
  --home <dir>             Install into <dir>/bin (default: \$ETHER_HOME or ~/.ether).
  --no-modify-path         Don't add the install directory to PATH.
  --uninstall              Remove what the installer added.
  --print-version          Print the version of this checkout.
  --print-target           Print this platform's target.
  -h, --help               Print this help.

Targets: $TARGETS
EOF
}

say() { printf '%s\n' "$*" >&2; }
fail() { printf 'error: %s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------------------- the platform

target() {
  local os arch
  os="$(uname -s)"; arch="$(uname -m)"
  case "$arch" in
    x86_64 | amd64) arch="x86_64" ;;
    arm64 | aarch64) arch="aarch64" ;;
    *) fail "unsupported architecture: $arch" ;;
  esac
  case "$os" in
    Linux)
      if ldd --version 2>&1 | grep -qi musl; then fail "musl-based Linux (e.g. Alpine) isn't supported; use a glibc-based distribution or --compile with a glibc Deno."; fi
      echo "$arch-unknown-linux-gnu" ;;
    Darwin)
      # An x86_64 shell on Apple Silicon (Rosetta) still gets the native build.
      if [ "$arch" = "x86_64" ] && [ "$(sysctl -n sysctl.proc_translated 2>/dev/null || echo 0)" = "1" ]; then arch="aarch64"; fi
      echo "$arch-apple-darwin" ;;
    MINGW* | MSYS* | CYGWIN*)
      [ "$arch" = "x86_64" ] || say "warning: no Windows build for $arch; using x86_64 (runs under emulation on Windows on ARM)."
      echo "x86_64-pc-windows-msvc" ;;
    *) fail "unsupported operating system: $os" ;;
  esac
}

windows() { case "$1" in *windows*) return 0 ;; *) return 1 ;; esac; }
executable() { if windows "$1"; then echo "$2.exe"; else echo "$2"; fi; }
archive() { if windows "$1"; then echo "$NAME-$1.zip"; else echo "$NAME-$1.tar.gz"; fi; }

# ---------------------------------------------------------------------------- tools

download() {
  if command -v curl >/dev/null 2>&1; then curl -fsSL --retry 3 -o "$2" "$1"
  elif command -v wget >/dev/null 2>&1; then wget -q -O "$2" "$1"
  else fail "neither curl nor wget is available"; fi
}

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1
  elif command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | cut -d' ' -f1
  elif command -v certutil >/dev/null 2>&1; then certutil -hashfile "$(native_path "$1")" SHA256 | sed -n 2p | tr -d ' \r'
  else fail "no SHA-256 tool (sha256sum, shasum or certutil) is available"; fi
}

native_path() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else echo "$1"; fi; }

unpack() {
  case "$1" in
    *.tar.gz) tar -xzf "$1" -C "$2" ;;
    *.zip)
      if command -v unzip >/dev/null 2>&1; then unzip -oq "$1" -d "$2"
      elif command -v powershell.exe >/dev/null 2>&1; then powershell.exe -NoProfile -Command "Expand-Archive -Force -LiteralPath '$(native_path "$1")' -DestinationPath '$(native_path "$2")'"
      elif command -v python3 >/dev/null 2>&1; then python3 -m zipfile -e "$1" "$2"
      else fail "no tool to unpack a .zip (unzip, powershell or python3)"; fi ;;
  esac
}

pack() { # pack <dir> <file> <archive>
  case "$3" in
    *.tar.gz) tar -czf "$3" -C "$1" "$2" ;;
    *.zip)
      if command -v zip >/dev/null 2>&1; then (cd "$1" && zip -q "$(cd "$(dirname "$3")" && pwd)/$(basename "$3")" "$2")
      else (cd "$1" && python3 -m zipfile -c "$(cd "$(dirname "$3")" && pwd)/$(basename "$3")" "$2"); fi ;;
  esac
}

temporary() { mktemp -d 2>/dev/null || mktemp -d -t ether; }

# ---------------------------------------------------------------------------- compiling (from a checkout)

checkout() {
  local here
  here="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || true)"
  [ -n "$here" ] && [ -f "$here/$ENTRY" ] || fail "--compile needs a checkout of $REPOSITORY (run ./install.sh from inside it)"
  echo "$here"
}

need_deno() {
  command -v deno >/dev/null 2>&1 || fail "--compile needs Deno (https://deno.com): curl -fsSL https://deno.land/install.sh | sh"
}

print_version() {
  local root; root="$(checkout)"
  need_deno
  deno eval --no-config "const { env } = await import('file://$root/$ENTRY'); console.log(env.version.toSemver())"
}

compile() { # compile <target> <dir>: the executable for <target> in <dir>
  local root includes=() i
  root="$(checkout)"
  need_deno
  for i in "${INCLUDES[@]}"; do includes+=(--include "$i"); done
  say "Compiling $NAME for $1 ..."
  (cd "$root" && deno compile -A --no-check --no-config --quiet "${includes[@]}" --target "$1" --output "$2/$(executable "$1" "$NAME")" "$ENTRY") \
    || fail "compiling for $1 failed"
}

build() { # build <targets> <output>: an archive per target and their SHA256SUMS
  local output="$2" t work file
  mkdir -p "$output"; output="$(cd "$output" && pwd)"
  for t in $1; do
    work="$(temporary)"
    compile "$t" "$work"
    file="$(archive "$t")"
    rm -f "$output/$file"
    pack "$work" "$(executable "$t" "$NAME")" "$output/$file"
    rm -rf "$work"
    say "  $output/$file"
  done
  (cd "$output" && for file in "$NAME"-*.tar.gz "$NAME"-*.zip; do [ -f "$file" ] && echo "$(sha256 "$file")  $file"; done > SHA256SUMS) || true
}

# ---------------------------------------------------------------------------- installing

fetch() { # fetch <source> <file> <dir>: <file> from a release (URL) or a directory into <dir>
  case "$1" in
    http://* | https://*) download "$1/$2" "$3/$2" ;;
    *) [ -f "$1/$2" ] && cp "$1/$2" "$3/$2" ;;
  esac
}

release() { # release <source> <target>: the executable, downloaded and checked, in a new directory
  local source="$1" file work expected actual
  file="$(archive "$2")"
  work="$(temporary)"
  say "Downloading $file from $source ..."
  fetch "$source" "$file" "$work" || fail "couldn't get $file from $source (is there a release for $2?)"
  if fetch "$source" SHA256SUMS "$work" 2>/dev/null; then
    expected="$(grep " $file\$" "$work/SHA256SUMS" | cut -d' ' -f1 || true)"
    actual="$(sha256 "$work/$file")"
    [ -n "$expected" ] || fail "SHA256SUMS has no entry for $file"
    [ "$expected" = "$actual" ] || fail "checksum mismatch for $file: expected $expected, got $actual"
  else
    say "warning: no SHA256SUMS next to $file; not verified."
  fi
  unpack "$work/$file" "$work"
  echo "$work"
}

place() { # place <dir with the executable> <target>: into $ETHER_HOME/bin, with its aliases
  local bin="$ETHER_HOME/bin" main alias name
  main="$(executable "$2" "$NAME")"
  mkdir -p "$bin"
  rm -f "$bin/$main"
  cp "$1/$main" "$bin/$main"
  chmod 755 "$bin/$main"
  # macOS: Apple Silicon only runs signed executables; an ad-hoc signature is enough (and harmless if one is there).
  if [ "$(uname -s)" = "Darwin" ]; then
    xattr -d com.apple.quarantine "$bin/$main" 2>/dev/null || true
    codesign --force --sign - "$bin/$main" 2>/dev/null || true
  fi
  for alias in $ALIASES; do
    name="$(executable "$2" "$alias")"
    rm -f "$bin/$name"
    # Windows: a hard link (symbolic links need administrator rights there); elsewhere a symbolic link.
    if windows "$2"; then ln "$bin/$main" "$bin/$name" 2>/dev/null || cp "$bin/$main" "$bin/$name"
    else ln -s "$main" "$bin/$name"; fi
  done
  say "Installed $bin/$main (and ${ALIASES// /, })"
}

profiles() { # the shell startup files that should put $ETHER_HOME/bin on PATH
  local shell; shell="$(basename "${SHELL:-}")"
  echo "$HOME/.profile"
  if [ -f "$HOME/.bashrc" ] || [ "$shell" = "bash" ]; then echo "$HOME/.bashrc"; fi
  if [ -f "$HOME/.bash_profile" ]; then echo "$HOME/.bash_profile"; fi
  if [ -f "${ZDOTDIR:-$HOME}/.zshrc" ] || [ "$shell" = "zsh" ]; then echo "${ZDOTDIR:-$HOME}/.zshrc"; fi
  if [ -d "${XDG_CONFIG_HOME:-$HOME/.config}/fish" ] || [ "$shell" = "fish" ]; then echo "${XDG_CONFIG_HOME:-$HOME/.config}/fish/conf.d/ether.fish"; fi
  if [ -f "$HOME/.cshrc" ] || [ -f "$HOME/.tcshrc" ] || [ "$shell" = "csh" ] || [ "$shell" = "tcsh" ]; then if [ -f "$HOME/.tcshrc" ]; then echo "$HOME/.tcshrc"; else echo "$HOME/.cshrc"; fi; fi
  if command -v pwsh >/dev/null 2>&1 && ! windows "$(target)"; then echo "${XDG_CONFIG_HOME:-$HOME/.config}/powershell/profile.ps1"; fi
}

add_to_path() { # add_to_path <target>
  local bin="$ETHER_HOME/bin" file line changed=""
  while IFS= read -r file; do
    case "$file" in
      *.fish) line="contains \"$bin\" \$PATH; or set -gx PATH \"$bin\" \$PATH" ;;
      *.cshrc | *.tcshrc) line="if ( \":\${PATH}:\" !~ *\":$bin:\"* ) setenv PATH \"$bin:\${PATH}\"" ;;
      *.ps1) line="if (-not ((\$env:PATH -split ':') -contains '$bin')) { \$env:PATH = '$bin:' + \$env:PATH }" ;;
      *) line="case \":\$PATH:\" in *\":$bin:\"*) ;; *) export PATH=\"$bin:\$PATH\" ;; esac" ;;
    esac
    mkdir -p "$(dirname "$file")"
    if [ -f "$file" ] && grep -qF "$MARKER" "$file"; then continue; fi
    printf '\n%s\n%s\n' "$MARKER" "$line" >> "$file"
    changed="$changed $file"
  done < <(profiles)
  [ -z "$changed" ] || say "Added $bin to PATH in:$changed"
  # Windows: also for cmd, PowerShell and everything started outside of this shell.
  if windows "$1" && command -v powershell.exe >/dev/null 2>&1; then
    powershell.exe -NoProfile -Command "
      \$dir = '$(native_path "$bin")'
      \$path = [Environment]::GetEnvironmentVariable('Path', 'User')
      if (-not ((\$path -split ';') -contains \$dir)) {
        [Environment]::SetEnvironmentVariable('Path', ((@(\$path -split ';' | Where-Object { \$_ }) + \$dir) -join ';'), 'User')
        Write-Host \"Added \$dir to your user PATH.\"
      }" >&2 || say "warning: couldn't add $bin to the Windows user PATH."
  fi
}

remove_from_path() { # remove_from_path <target>
  local file
  while IFS= read -r file; do
    [ -f "$file" ] && grep -qF "$MARKER" "$file" || continue
    awk -v marker="$MARKER" '{ line[NR] = $0 }
      END { for (i = 1; i <= NR; i++) { if (line[i] == marker) { if (n > 0 && kept[n] == "") n--; i++; continue } kept[++n] = line[i] }
            for (i = 1; i <= n; i++) print kept[i] }' "$file" > "$file.ether" && mv "$file.ether" "$file"
    case "$file" in *.fish) grep -q '[^[:space:]]' "$file" || rm -f "$file" ;; esac
  done < <(profiles)
  if windows "$1" && command -v powershell.exe >/dev/null 2>&1; then
    powershell.exe -NoProfile -Command "
      \$dir = '$(native_path "$ETHER_HOME/bin")'
      \$path = [Environment]::GetEnvironmentVariable('Path', 'User')
      [Environment]::SetEnvironmentVariable('Path', ((\$path -split ';' | Where-Object { \$_ -and \$_ -ne \$dir }) -join ';'), 'User')" >&2 || true
  fi
}

uninstall() {
  local alias
  rm -f "$ETHER_HOME/bin/$NAME" "$ETHER_HOME/bin/$NAME.exe"
  for alias in $ALIASES; do rm -f "$ETHER_HOME/bin/$alias" "$ETHER_HOME/bin/$alias.exe"; done
  rmdir "$ETHER_HOME/bin" "$ETHER_HOME" 2>/dev/null || true
  remove_from_path "$(target)"
  say "Removed $NAME from $ETHER_HOME/bin and PATH."
}

finish() {
  local bin="$ETHER_HOME/bin" main
  main="$bin/$(executable "$1" "$NAME")"
  "$main" --version >/dev/null 2>&1 || fail "the installed $main doesn't run"
  say ""
  say "Ether $("$main" --version) is installed."
  case ":$PATH:" in
    *":$bin:"*) say "Run \`$NAME\` (or \`${ALIASES// /\` or \`}\`)." ;;
    *) say "Open a new terminal (or run: export PATH=\"$bin:\$PATH\"), then run \`$NAME\`." ;;
  esac
}

# ---------------------------------------------------------------------------- main

main() {
  local mode="install" compile_target="" output="./dist" from="" version="" modify_path="${ETHER_NO_MODIFY_PATH:+no}" t dir
  while [ $# -gt 0 ]; do
    case "$1" in
      --compile) mode="compile"; if [ $# -gt 1 ] && [ "${2#-}" = "$2" ]; then compile_target="$2"; shift; fi ;;
      --compile=*) mode="compile"; compile_target="${1#*=}" ;;
      --output) output="${2:?--output needs a directory}"; shift ;;
      --output=*) output="${1#*=}" ;;
      --from) from="${2:?--from needs a URL or directory}"; shift ;;
      --from=*) from="${1#*=}" ;;
      --version) version="${2:?--version needs a version}"; shift ;;
      --version=*) version="${1#*=}" ;;
      --home) ETHER_HOME="${2:?--home needs a directory}"; shift ;;
      --home=*) ETHER_HOME="${1#*=}" ;;
      --no-modify-path) modify_path="no" ;;
      --uninstall) mode="uninstall" ;;
      --print-version) mode="print-version" ;;
      --print-target) mode="print-target" ;;
      -h | --help) usage; exit 0 ;;
      *) usage >&2; fail "unknown option: $1" ;;
    esac
    shift
  done

  case "$mode" in
    print-version) print_version; return ;;
    print-target) target; return ;;
    uninstall) uninstall; return ;;
  esac

  t="$(target)"
  if [ "$mode" = "compile" ] && [ -n "$compile_target" ] && [ "$compile_target" != "native" ] && [ "$compile_target" != "$t" ]; then
    if [ "$compile_target" = "all" ]; then build "$TARGETS" "$output"
    else case " $TARGETS " in *" $compile_target "*) build "$compile_target" "$output" ;; *) fail "unknown target: $compile_target (one of: $TARGETS)" ;; esac; fi
    return
  fi

  if [ "$mode" = "compile" ]; then dir="$(temporary)"; compile "$t" "$dir"
  else
    if [ -z "$from" ]; then
      if [ -n "$version" ]; then from="https://github.com/$REPOSITORY/releases/download/v${version#v}"
      else from="https://github.com/$REPOSITORY/releases/latest/download"; fi
    fi
    dir="$(release "$from" "$t")"
  fi
  place "$dir" "$t"
  rm -rf "$dir"
  [ "$modify_path" = "no" ] || add_to_path "$t"
  finish "$t"
}

main "$@"

#!/usr/bin/env bash
# Tab completion for ether/ray CLI

_ether_completions() {
  local cur prev words cword
  _init_completion || return

  local script_dir
  script_dir="$(cd "$(dirname "$(readlink -f "$(command -v "${words[0]}" 2>/dev/null || echo "${words[0]}")")")" 2>/dev/null && pwd)"
  if [[ -z "$script_dir" ]]; then
    # Fallback: try to find the script relative to common locations
    for d in "$HOME/Documents/github.com/orbitmines/ray" "$(pwd)"; do
      if [[ -f "$d/ether" ]]; then
        script_dir="$d"
        break
      fi
    done
  fi

  local cache_file="$script_dir/.ether/cache/index.tsv"
  local index_file="$script_dir/Ether/library/Index.ray"

  # Helper: get language names from cache
  _ether_lang_names() {
    if [[ -f "$cache_file" ]]; then
      awk -F'\t' '{ print $7 }' "$cache_file" 2>/dev/null | sort -u
    fi
  }

  # First argument completion
  if [[ $cword -eq 1 ]]; then
    # Completing the first word
    if [[ "$cur" == Language.* ]]; then
      # Complete language names after "Language."
      local prefix="${cur#Language.}"
      local names
      names=$(_ether_lang_names)
      local completions=()
      while IFS= read -r name; do
        if [[ -z "$prefix" ]] || [[ "${name,,}" == "${prefix,,}"* ]]; then
          completions+=("Language.$name")
        fi
      done <<< "$names"
      COMPREPLY=($(compgen -W "${completions[*]}" -- "$cur"))
    elif [[ "$cur" == Lang* ]]; then
      COMPREPLY=($(compgen -W "Language Language." -- "$cur"))
    elif [[ "$cur" == Tool* ]]; then
      COMPREPLY=($(compgen -W "Tool" -- "$cur"))
    elif [[ "$cur" == Lib* ]]; then
      COMPREPLY=($(compgen -W "Library" -- "$cur"))
    else
      COMPREPLY=($(compgen -W "Language Language. Tool Library list help" -- "$cur"))
    fi
    return
  fi

  # Second argument completion
  if [[ $cword -eq 2 ]]; then
    local first="${words[1]}"
    if [[ "$first" =~ ^Language\..+$ ]]; then
      # Actions for a specific language
      COMPREPLY=($(compgen -W "install clone update info -@" -- "$cur"))
    elif [[ "$first" == "Language" ]]; then
      COMPREPLY=($(compgen -W "list install clone update" -- "$cur"))
    elif [[ "$first" == "Tool" || "$first" == "Library" ]]; then
      COMPREPLY=($(compgen -W "list" -- "$cur"))
    fi
    return
  fi

  # Third argument completion
  if [[ $cword -eq 3 ]]; then
    local first="${words[1]}"
    local second="${words[2]}"
    if [[ "$first" =~ ^Language\..+$ ]]; then
      if [[ "$second" == "-@" ]]; then
        # File/directory completion
        _filedir
        return
      elif [[ "$second" == "install" ]]; then
        COMPREPLY=($(compgen -W "--from-source" -- "$cur"))
        return
      fi
    elif [[ "$first" == "Language" && "$second" == "install" ]]; then
      COMPREPLY=($(compgen -W "--from-source" -- "$cur"))
      return
    fi
  fi
}

# Register completions for both ether and ray
complete -F _ether_completions ether
complete -F _ether_completions ray

#!/usr/bin/env bash
exec dotnet csharp 2>/dev/null || exec dotnet csi 2>/dev/null || { echo "C# interactive not available" >&2; exit 1; }

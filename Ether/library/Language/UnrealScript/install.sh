#!/usr/bin/env bash
set -euo pipefail
# UnrealScript is compiled within the Unreal Engine editor (UDK/UE3).
# There is no standalone compiler. Install the Unreal Development Kit.
echo "UnrealScript requires the Unreal Development Kit (UDK) or Unreal Engine 3."
echo "Download from: https://www.unrealengine.com/"
echo "No standalone installer available." >&2
exit 1

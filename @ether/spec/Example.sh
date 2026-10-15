code=$(sed -n '/^```cpp$/,/^```$/p' Example.md | sed '1d;$d')
executable=$(sed -n '/^```toylang$/,/^```$/p' Example.md | sed '1d;$d')
echo "$executable"
clang -x c -o /tmp/a - <<< "$code" && /tmp/a "$executable" ; echo $?
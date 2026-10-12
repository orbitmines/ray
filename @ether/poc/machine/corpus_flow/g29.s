lea rax,[rsi+0x1]
imul rax,rsi
cmp rsi,rdx
cmovle rax,rsi
ret

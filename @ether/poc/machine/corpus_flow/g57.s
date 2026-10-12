imul rdx,rdi
xor eax,eax
cmp rsi,rdi
cmovle rax,rdx
ret

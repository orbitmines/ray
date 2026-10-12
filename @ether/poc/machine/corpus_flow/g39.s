xor eax,eax
cmp rsi,0x3
jle 1a
mov rax,rdi
lea rdx,[rdi+0x6]
imul rax,rdi
cmp rsi,rdi
cmovge rax,rdx
ret

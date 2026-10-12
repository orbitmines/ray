xor eax,eax
cmp rdi,rsi
jg 16
add rsi,0x3
mov rax,rdi
cmp rdi,0x6
cmovg rax,rsi
ret

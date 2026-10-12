add rdi,rsi
mov eax,0x7
cmp rsi,0x7
cmovne rax,rdi
ret

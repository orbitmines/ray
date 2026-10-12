cmp rsi,rdi
je 18
mov rax,rsi
imul rax,rsi
cmp rdi,0x4
cmovne rax,rsi
ret
nop DWORD PTR [rax]
mov eax,0x1
sub rax,rsi
ret

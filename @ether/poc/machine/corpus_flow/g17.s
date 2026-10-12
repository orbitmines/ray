xor eax,eax
cmp rdi,rsi
jle 20
nop WORD PTR [rax+rax*1+0x0]
sub rdi,0x5
add rax,rdi
cmp rsi,rdi
jl 10
ret
nop DWORD PTR [rax]
ret

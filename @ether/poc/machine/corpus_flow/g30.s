xor eax,eax
cmp rdi,rsi
jl 20
nop WORD PTR [rax+rax*1+0x0]
sub rdi,0x5
lea rax,[rax+rdi*1+0x7]
cmp rsi,rdi
jle 10
ret
nop
ret

xor eax,eax
cmp rdi,rsi
jl 20
nop WORD PTR [rax+rax*1+0x0]
sub rdi,0x3
add rax,0x9
cmp rsi,rdi
jle 10
ret
xchg ax,ax
ret

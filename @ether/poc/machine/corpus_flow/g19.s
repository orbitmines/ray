xor eax,eax
cmp edi,esi
jle 20
cs nop WORD PTR [rax+rax*1+0x0]
sub edi,0x5
add eax,edi
cmp esi,edi
jl 10
ret
nop WORD PTR [rax+rax*1+0x0]
ret

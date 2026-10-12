xor eax,eax
cmp edi,esi
jl 20
cs nop WORD PTR [rax+rax*1+0x0]
sub edi,0x5
add eax,edx
add eax,edi
cmp esi,edi
jle 10
ret
nop DWORD PTR [rax+0x0]
ret

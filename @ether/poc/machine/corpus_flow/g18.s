mov eax,edx
cmp edi,esi
jl 20
mov edx,0x1
sub edx,eax
xor eax,eax
nop
sub edi,0x5
add eax,edx
cmp esi,edi
jle 10
ret
nop WORD PTR [rax+rax*1+0x0]
xor eax,eax
ret

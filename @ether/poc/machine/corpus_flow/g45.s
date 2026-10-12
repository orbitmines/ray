cmp edi,esi
jl 40
mov edx,edi
sub edi,0x1
mov eax,0x9
sub edx,esi
cmp esi,edi
jg 48
and edx,0x1
je 30
sub edi,0x1
mov eax,0x12
cmp esi,edi
jg 49
data16 cs nop WORD PTR [rax+rax*1+0x0]
sub edi,0x2
add eax,0x12
cmp esi,edi
jle 30
ret
nop DWORD PTR [rax+rax*1+0x0]
xor eax,eax
ret
nop DWORD PTR [rax+rax*1+0x0]
ret
ret

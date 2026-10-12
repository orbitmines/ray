test edi,edi
jle 20
xor eax,eax
xor edx,edx
nop DWORD PTR [rax+rax*1+0x0]
mov ecx,eax
add eax,0x1
sub ecx,esi
add edx,ecx
cmp edi,eax
jne 10
mov eax,edx
ret
xor edx,edx
mov eax,edx
ret

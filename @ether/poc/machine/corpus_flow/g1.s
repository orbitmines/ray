mov eax,esi
cmp esi,edi
jne 12
add edx,esi
mov eax,0x4
test esi,esi
cmovne eax,edx
ret

imul esi,edx
mov eax,edx
cmp edi,0x2
cmovle eax,esi
ret

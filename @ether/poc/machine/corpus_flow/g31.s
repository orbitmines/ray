mov eax,esi
imul eax,esi
imul eax,edi
add eax,eax
cmp edx,0x2
cmovne eax,esi
ret

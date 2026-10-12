add esi,0x6
xor eax,eax
imul esi,edi
test edi,edi
cmovg eax,esi
ret

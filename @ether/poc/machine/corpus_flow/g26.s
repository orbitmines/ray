add edx,esi
sub edi,0x9
mov eax,0x8
imul edi,edx
cmp esi,0x8
cmovg eax,edi
ret

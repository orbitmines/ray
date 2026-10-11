mov eax,esi
imul eax,esi
imul esi,edi
neg eax
shl eax,0x2
sub eax,esi
add eax,edx
ret

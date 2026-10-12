mov eax,edi
sub eax,esi
imul eax,edx
xor edx,edx
cmp edi,esi
cmovle eax,edx
ret

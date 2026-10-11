mov eax,edi
mov edx,edi
imul eax,esi
sub edx,esi
imul edx,eax
imul edx,edi
imul eax,edx
ret

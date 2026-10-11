lea edx,[rdi+rdi*1]
mov eax,0x5
sub eax,edx
sub eax,esi
sub esi,edi
imul esi,edi
add eax,esi
ret

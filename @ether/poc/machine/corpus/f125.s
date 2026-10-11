mov edx,edi
lea eax,[rsi+0x7]
imul edx,edi
imul esi,edi
sub eax,edx
imul eax,esi
add eax,eax
ret

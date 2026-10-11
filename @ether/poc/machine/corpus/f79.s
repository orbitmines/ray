mov eax,edx
sub esi,edx
sub eax,edi
sub edi,0x1
imul eax,esi
imul edi,edx
lea eax,[rax+rdi*1-0x4]
ret

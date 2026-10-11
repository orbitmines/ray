mov ecx,edx
imul ecx,edx
lea eax,[rcx*8+0x0]
sub eax,ecx
lea eax,[rax+rdx*1-0x4]
ret

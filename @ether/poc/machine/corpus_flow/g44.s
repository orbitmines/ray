mov eax,edx
mov ecx,esi
sub eax,esi
neg ecx
cmp edx,esi
lea eax,[rax+rcx*2]
cmovg eax,esi
ret

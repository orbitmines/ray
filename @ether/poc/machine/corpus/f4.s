mov eax,edi
neg edi
sub eax,esi
lea eax,[rax+rdx*1-0x7]
lea eax,[rax+rdi*2]
ret

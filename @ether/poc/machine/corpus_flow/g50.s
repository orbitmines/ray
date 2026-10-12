lea eax,[rdi*8+0x0]
xor edx,edx
sub eax,edi
test edi,edi
cmovle eax,edx
ret

xor edx,edx
lea eax,[rdi*4+0x0]
test edi,edi
cmovle eax,edx
ret

xor edx,edx
lea eax,[rdi*8+0x0]
test edi,edi
cmovle eax,edx
ret

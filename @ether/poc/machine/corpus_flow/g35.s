xor edx,edx
lea eax,[rdi+rdi*8]
test edi,edi
cmovle eax,edx
ret

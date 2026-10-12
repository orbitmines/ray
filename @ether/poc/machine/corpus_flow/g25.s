lea eax,[rdi+rdi*4]
xor edx,edx
shl eax,0x2
test edi,edi
cmovle eax,edx
ret

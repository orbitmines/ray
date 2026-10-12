lea edx,[rdi+0x4]
lea eax,[rdi+rsi*1]
cmp edi,0x3
cmovle eax,edx
ret

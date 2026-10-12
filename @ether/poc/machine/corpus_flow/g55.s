cmp esi,edi
jl 18
lea edi,[rdi+rdi*4]
test esi,esi
mov eax,0x1
cmovle eax,edi
ret
nop WORD PTR [rax+rax*1+0x0]
lea eax,[rsi+rdi*1]
ret

cmp rdi,0x7
jle 20
add rdi,rdi
mov eax,0x9
cmp rdx,rsi
cmovle rax,rdi
ret
cs nop WORD PTR [rax+rax*1+0x0]
lea rax,[rsi+rsi*8]
ret

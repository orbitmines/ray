xor ecx,ecx
test rsi,rsi
je 33
movsxd rax,DWORD PTR [rdi]
mov rcx,rax
jle 33
lea rdx,[rdi+0x4]
lea rsi,[rdi+rsi*4]
jmp 27
nop DWORD PTR [rax+0x0]
movsxd rax,DWORD PTR [rdx]
add rdx,0x4
cmp rcx,rax
cmovl rcx,rax
cmp rdx,rsi
jne 20
mov rax,rcx
ret

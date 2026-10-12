xor ecx,ecx
test rsi,rsi
je 33
movzx eax,BYTE PTR [rdi]
mov rcx,rax
jle 33
lea rdx,[rdi+0x1]
add rdi,rsi
jmp 27
nop DWORD PTR [rax+rax*1+0x0]
movzx eax,BYTE PTR [rdx]
add rdx,0x1
cmp rcx,rax
cmovl rcx,rax
cmp rdx,rdi
jne 20
mov rax,rcx
ret

test rdi,rdi
jle 38
xor eax,eax
xor edx,edx
test dil,0x1
je 20
mov eax,0x1
cmp rdi,0x1
je 2e
nop WORD PTR [rax+rax*1+0x0]
lea rdx,[rdx+rax*2+0x1]
add rax,0x2
cmp rdi,rax
jne 20
mov rax,rdx
ret
nop WORD PTR [rax+rax*1+0x0]
xor edx,edx
mov rax,rdx
ret

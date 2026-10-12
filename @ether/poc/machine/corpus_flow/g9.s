test rdi,rdi
jle 38
lea rcx,[rdi+rdi*8]
xor eax,eax
xor edx,edx
and edi,0x1
je 20
mov eax,0x9
cmp rax,rcx
je 2e
nop DWORD PTR [rax+0x0]
lea rdx,[rdx+rax*2+0x9]
add rax,0x12
cmp rax,rcx
jne 20
mov rax,rdx
ret
nop WORD PTR [rax+rax*1+0x0]
xor edx,edx
mov rax,rdx
ret

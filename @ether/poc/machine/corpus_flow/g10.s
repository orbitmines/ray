test rdi,rdi
jle 38
xor eax,eax
xor edx,edx
test dil,0x1
je 20
mov eax,0x1
mov edx,0x1
cmp rax,rdi
je 31
xchg ax,ax
lea rdx,[rax+rdx*1+0x1]
add rax,0x2
add rdx,rax
cmp rax,rdi
jne 20
mov rax,rdx
ret
nop DWORD PTR [rax]
xor edx,edx
mov rax,rdx
ret

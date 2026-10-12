test rdi,rdi
jle 40
xor eax,eax
xor edx,edx
nop
data16 cs nop WORD PTR [rax+rax*1+0x0]
data16 cs nop WORD PTR [rax+rax*1+0x0]
mov rcx,rax
imul rcx,rax
add rax,0x1
add rdx,rcx
cmp rdi,rax
jne 20
mov rax,rdx
ret
nop WORD PTR [rax+rax*1+0x0]
xor edx,edx
mov rax,rdx
ret

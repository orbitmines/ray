mov rax,rdi
cmp rdi,rdx
je 15
lea rcx,[rdx+rdx*4]
mov eax,0x8
cmovge rax,rcx
ret

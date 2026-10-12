cmp rsi,0x1
jle 20
lea rax,[rdi+0x8]
lea rcx,[rdi+rsi*8]
xchg ax,ax
mov rdx,QWORD PTR [rax-0x8]
add QWORD PTR [rax],rdx
add rax,0x8
cmp rcx,rax
jne 10
mov rax,rsi
ret

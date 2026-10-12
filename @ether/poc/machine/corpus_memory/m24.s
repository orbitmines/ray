cmp rsi,0x1
jle 1e
lea rax,[rdi+0x4]
lea rcx,[rdi+rsi*4]
xchg ax,ax
mov edx,DWORD PTR [rax-0x4]
add DWORD PTR [rax],edx
add rax,0x4
cmp rcx,rax
jne 10
mov rax,rsi
ret

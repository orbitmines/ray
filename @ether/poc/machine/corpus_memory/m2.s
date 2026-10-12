mov rcx,rdx
xor eax,eax
test rsi,rsi
jg 29
jmp 38
nop WORD PTR [rax+rax*1+0x0]
data16 cs nop WORD PTR [rax+rax*1+0x0]
add rax,0x1
cmp rsi,rax
je 38
movsxd rdx,DWORD PTR [rdi+rax*4]
cmp rdx,rcx
jne 20
ret
nop DWORD PTR [rax+rax*1+0x0]
mov rax,0xffffffffffffffff
ret

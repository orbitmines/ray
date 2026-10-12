xor eax,eax
test rsi,rsi
jg 19
jmp 20
nop DWORD PTR [rax+0x0]
add rax,0x1
cmp rsi,rax
je 20
cmp QWORD PTR [rdi+rax*8],rdx
jne 10
ret
mov rax,0xffffffffffffffff
ret

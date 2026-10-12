test rsi,rsi
jle 20
lea rdx,[rdi+rsi*8]
xor eax,eax
nop DWORD PTR [rax+rax*1+0x0]
add rax,QWORD PTR [rdi]
add rdi,0x8
cmp rdi,rdx
jne 10
ret
nop DWORD PTR [rax]
xor eax,eax
ret

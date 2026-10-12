test rsi,rsi
jle 20
lea rcx,[rdi+rsi*4]
xor eax,eax
nop DWORD PTR [rax+rax*1+0x0]
movsxd rdx,DWORD PTR [rdi]
add rdi,0x4
add rax,rdx
cmp rdi,rcx
jne 10
ret
xor eax,eax
ret

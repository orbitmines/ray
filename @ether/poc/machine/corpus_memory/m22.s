test rsi,rsi
jle 2e
lea rax,[rdi+rsi*4]
test sil,0x1
je 20
add DWORD PTR [rdi],edx
add rdi,0x4
cmp rdi,rax
je 2e
nop WORD PTR [rax+rax*1+0x0]
add DWORD PTR [rdi],edx
add DWORD PTR [rdi+0x4],edx
add rdi,0x8
cmp rdi,rax
jne 20
mov rax,rsi
ret

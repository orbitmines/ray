test rsi,rsi
jle 2e
lea rax,[rdi+rsi*1]
test sil,0x1
je 20
add BYTE PTR [rdi],dl
add rdi,0x1
cmp rax,rdi
je 2e
nop WORD PTR [rax+rax*1+0x0]
add BYTE PTR [rdi],dl
add BYTE PTR [rdi+0x1],dl
add rdi,0x2
cmp rax,rdi
jne 20
mov rax,rsi
ret

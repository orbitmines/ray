test rsi,rsi
jle 20
add rsi,rdi
xor eax,eax
nop WORD PTR [rax+rax*1+0x0]
movzx edx,BYTE PTR [rdi]
add rdi,0x1
add rax,rdx
cmp rdi,rsi
jne 10
ret
xor eax,eax
ret

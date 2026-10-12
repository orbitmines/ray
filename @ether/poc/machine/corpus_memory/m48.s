cmp rsi,0x1
jle 1f
lea rax,[rdi+0x1]
add rdi,rsi
nop DWORD PTR [rax]
movzx edx,BYTE PTR [rax-0x1]
add BYTE PTR [rax],dl
add rax,0x1
cmp rdi,rax
jne 10
mov rax,rsi
ret

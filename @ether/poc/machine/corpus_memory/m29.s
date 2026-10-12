mov rcx,rdx
test rsi,rsi
jle 40
add rsi,rdi
xor eax,eax
nop DWORD PTR [rax+rax*1+0x0]
data16 cs nop WORD PTR [rax+rax*1+0x0]
movzx edx,BYTE PTR [rdi]
cmp rdx,rcx
setne dl
add rdi,0x1
movzx edx,dl
add rax,rdx
cmp rdi,rsi
jne 20
ret
nop DWORD PTR [rax+0x0]
xor eax,eax
ret

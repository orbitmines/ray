mov rcx,rdx
test rsi,rsi
jle 40
lea rsi,[rdi+rsi*4]
xor eax,eax
nop DWORD PTR [rax+0x0]
data16 cs nop WORD PTR [rax+rax*1+0x0]
movsxd rdx,DWORD PTR [rdi]
cmp rdx,rcx
sete dl
add rdi,0x4
movzx edx,dl
add rax,rdx
cmp rdi,rsi
jne 20
ret
nop DWORD PTR [rax+0x0]
xor eax,eax
ret

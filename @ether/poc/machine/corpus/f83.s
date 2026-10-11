mov rcx,rdx
imul rdx,rdx,0xfffffffffffffffb
imul rsi,rsi
lea rax,[rdx+0x5]
imul rax,rdi
imul rsi,rcx
add rax,0x14
imul rax,rsi
ret

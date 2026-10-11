mov rcx,rdx
mov rdx,0xfffffffffffffffb
lea rax,[rsi+0x6]
add rsi,rdi
sub rdx,rcx
imul rax,rsi
imul rdx,rcx
add rax,rdx
ret

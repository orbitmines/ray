lea rax,[rdx+rdi*1]
lea rcx,[rdx-0x7]
add rdx,rsi
imul rax,rcx
imul rdx,rdi
add rax,rdx
ret

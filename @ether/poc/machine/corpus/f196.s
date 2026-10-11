sub rdx,rdi
lea rax,[rsi+rcx*1-0x4]
imul rdx,rcx
imul rdx,rdi
add rax,rdx
ret

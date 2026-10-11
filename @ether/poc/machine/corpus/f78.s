sub rsi,rdi
lea rax,[rdi+rdx*1+0x8]
imul rsi,rdi
add rax,rsi
ret

add rcx,rsi
lea rax,[rcx+rdi*2]
imul rdi,rsi
imul rax,rdi
add rax,rax
ret

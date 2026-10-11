mov rax,rsi
lea rdx,[rdi+rdi*2]
sub rax,rdi
lea rax,[rax+rdx*2]
mov edx,0x1
sub rdx,rsi
imul rax,rdx
imul rax,rdi
ret

mov rax,rsi
mov edx,0x1
imul rax,rdi
sub rdx,rdi
imul rax,rsi
imul rax,rdx
shl rax,0x2
ret

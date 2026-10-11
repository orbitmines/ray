mov eax,0x4
lea rdx,[rdx+rdx*8]
sub rax,rsi
imul rax,rdi
add rax,rdx
ret

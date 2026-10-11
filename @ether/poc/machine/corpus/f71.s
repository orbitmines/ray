mov eax,0x2
sub rax,rdi
sub rax,rsi
imul rax,rdi
lea rax,[rax*4-0x5]
ret

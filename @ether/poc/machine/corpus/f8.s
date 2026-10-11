mov rdx,rsi
mov rax,0xfffffffffffffffc
neg rdx
sub rax,rdi
lea rax,[rax+rdx*4]
sub rax,rsi
ret

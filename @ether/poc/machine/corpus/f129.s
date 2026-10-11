lea rax,[rdi-0x3]
mov rdx,0xfffffffffffffff7
imul rax,rdi
sub rdx,rsi
lea rax,[rax+rdx*2]
ret

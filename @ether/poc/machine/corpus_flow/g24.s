mov rax,rdi
sub rax,rsi
cmp rdx,rdi
lea rax,[rax+rdx*1+0x4]
mov edx,0x7
cmovle rax,rdx
ret

lea rax,[rdi+rsi*1]
imul rax,rdi
sub rdi,rsi
lea rax,[rax+rdi*1-0x4]
ret

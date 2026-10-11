mov rdx,rdi
lea rax,[rdi+rsi*2]
imul rdx,rdi
sub rax,rdx
ret

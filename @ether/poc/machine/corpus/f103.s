mov rax,rdi
sub rdi,rdx
sub rax,rsi
lea rax,[rax+rdi*2+0x6]
ret

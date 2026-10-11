mov eax,0x2
sub rax,rcx
imul rax,rdx
lea rax,[rax+rdi*2]
imul rax,rsi
ret

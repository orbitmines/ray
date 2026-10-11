mov rax,rdx
imul rdx,rcx
sub rax,rcx
add rax,rsi
sub rax,rcx
lea rcx,[rdx*4+0x0]
sub rdx,rcx
lea rax,[rax+rdx*2]
ret

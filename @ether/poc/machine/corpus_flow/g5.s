cmp rdi,rsi
jle 30
mov rcx,rdx
sub rdi,0x4
xor eax,eax
neg rcx
imul rdx,rdi
shl rcx,0x2
jmp 24
nop DWORD PTR [rax+rax*1+0x0]
sub rdi,0x4
add rax,rdx
add rdx,rcx
cmp rsi,rdi
jl 20
ret
xor eax,eax
ret

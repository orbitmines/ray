cmp rdi,rsi
jl 58
mov rax,rdi
sub rdi,0x4
sub rax,rsi
shr rax,0x2
mov rdx,rax
mov rax,rdi
cmp rsi,rdi
jg 60
and edx,0x1
je 40
sub rdi,0x4
add rax,rdi
cmp rsi,rdi
jg 61
nop WORD PTR [rax+rax*1+0x0]
data16 cs nop WORD PTR [rax+rax*1+0x0]
lea rax,[rax+rdi*1-0x4]
sub rdi,0x8
add rax,rdi
cmp rsi,rdi
jle 40
ret
nop WORD PTR [rax+rax*1+0x0]
xor eax,eax
ret
nop DWORD PTR [rax+rax*1+0x0]
ret
ret

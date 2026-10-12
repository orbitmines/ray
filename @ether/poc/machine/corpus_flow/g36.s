cmp rdi,rsi
jl 50
mov rax,rdi
sub rdi,0x4
sub rax,rsi
shr rax,0x2
mov rdx,rax
mov eax,0x6
cmp rsi,rdi
jg 58
and edx,0x1
je 40
sub rdi,0x4
mov eax,0xc
cmp rsi,rdi
jg 59
xchg ax,ax
data16 cs nop WORD PTR [rax+rax*1+0x0]
sub rdi,0x8
add rax,0xc
cmp rsi,rdi
jle 40
ret
xchg ax,ax
xor eax,eax
ret
nop DWORD PTR [rax+rax*1+0x0]
ret
ret

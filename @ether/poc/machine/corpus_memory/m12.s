lea rax,[rsi-0x1]
test rax,rax
jle 3b
xor edx,edx
cs nop WORD PTR [rax+rax*1+0x0]
data16 cs nop WORD PTR [rax+rax*1+0x0]
mov ecx,DWORD PTR [rdi+rdx*4]
mov r8d,DWORD PTR [rdi+rax*4]
mov DWORD PTR [rdi+rdx*4],r8d
add rdx,0x1
mov DWORD PTR [rdi+rax*4],ecx
sub rax,0x1
cmp rdx,rax
jl 20
mov rax,rsi
ret

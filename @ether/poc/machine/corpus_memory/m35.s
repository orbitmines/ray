lea rax,[rsi-0x1]
test rax,rax
jle 3d
xor edx,edx
cs nop WORD PTR [rax+rax*1+0x0]
data16 cs nop WORD PTR [rax+rax*1+0x0]
movzx ecx,BYTE PTR [rdi+rdx*1]
movzx r8d,BYTE PTR [rdi+rax*1]
mov BYTE PTR [rdi+rdx*1],r8b
add rdx,0x1
mov BYTE PTR [rdi+rax*1],cl
sub rax,0x1
cmp rdx,rax
jl 20
mov rax,rsi
ret

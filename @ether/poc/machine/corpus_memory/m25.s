lea rax,[rsi-0x1]
test rax,rax
jle 3d
xor edx,edx
cs nop WORD PTR [rax+rax*1+0x0]
data16 cs nop WORD PTR [rax+rax*1+0x0]
mov rcx,QWORD PTR [rdi+rdx*8]
mov r8,QWORD PTR [rdi+rax*8]
mov QWORD PTR [rdi+rdx*8],r8
add rdx,0x1
mov QWORD PTR [rdi+rax*8],rcx
sub rax,0x1
cmp rdx,rax
jl 20
mov rax,rsi
ret

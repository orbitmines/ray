mov rcx,rdx
test rsi,rsi
jle 38
lea rsi,[rdi+rsi*8]
xor eax,eax
nop DWORD PTR [rax+0x0]
data16 cs nop WORD PTR [rax+rax*1+0x0]
xor edx,edx
cmp QWORD PTR [rdi],rcx
setg dl
add rdi,0x8
add rax,rdx
cmp rdi,rsi
jne 20
ret
nop DWORD PTR [rax]
xor eax,eax
ret

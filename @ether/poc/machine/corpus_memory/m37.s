test rsi,rsi
jle 30
lea rax,[rdi+rsi*8]
test sil,0x1
je 20
add QWORD PTR [rdi],rdx
add rdi,0x8
cmp rdi,rax
je 30
nop DWORD PTR [rax+rax*1+0x0]
add QWORD PTR [rdi],rdx
add QWORD PTR [rdi+0x8],rdx
add rdi,0x10
cmp rdi,rax
jne 20
mov rax,rsi
ret

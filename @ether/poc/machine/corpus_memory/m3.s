xor edx,edx
test rsi,rsi
je 33
mov rdx,QWORD PTR [rdi]
jle 33
lea rax,[rdi+0x8]
lea rsi,[rdi+rsi*8]
mov rcx,rdx
jmp 27
nop DWORD PTR [rax+0x0]
mov rcx,QWORD PTR [rax]
add rax,0x8
cmp rdx,rcx
cmovl rdx,rcx
cmp rax,rsi
jne 20
mov rax,rdx
ret

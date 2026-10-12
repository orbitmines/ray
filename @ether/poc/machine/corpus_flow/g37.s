cmp rsi,0x3
jg 20
add rsi,0x8
mov eax,0x5
cmp rdi,0x7
cmove rax,rsi
ret
nop DWORD PTR [rax+rax*1+0x0]
lea rax,[rdi+0x8]
ret

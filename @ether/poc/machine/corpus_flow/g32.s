mov eax,0x8
add rsi,0x6
mov edx,0x9
sub rax,rdi
imul rax,rsi
cmp rdi,0x9
cmovge rax,rdx
ret

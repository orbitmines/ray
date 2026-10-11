add rdx,rdi
sub rsi,rcx
shl rdi,0x2
imul rdx,rsi
sub rdi,rcx
lea rax,[rdx+rdi*1]
ret

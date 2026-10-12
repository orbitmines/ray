lea rax,[rdi+rdi*2]
xor edx,edx
add rax,rax
test rdi,rdi
cmovle rax,rdx
ret

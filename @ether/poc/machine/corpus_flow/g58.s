test edi,edi
jle 20
xor eax,eax
xor edx,edx
nop DWORD PTR [rax+rax*1+0x0]
lea edx,[rax+rdx*1+0x8]
add eax,0x1
cmp edi,eax
jne 10
mov eax,edx
ret
xchg ax,ax
xor edx,edx
mov eax,edx
ret

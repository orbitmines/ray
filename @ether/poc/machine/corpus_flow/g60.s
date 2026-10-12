lea eax,[rdi+rdi*1]
add edi,esi
cmp esi,0x9
cmovl eax,edi
ret

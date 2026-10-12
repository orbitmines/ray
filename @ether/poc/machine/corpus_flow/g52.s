cmp edi,esi
jg 10
lea eax,[rdi+0x1]
sub edi,0x2
imul eax,edi
ret
xchg ax,ax
imul esi,esi
mov eax,esi
imul eax,esi
ret

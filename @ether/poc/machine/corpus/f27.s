lea eax,[rsi+rsi*4]
neg eax
add eax,0x5
imul eax,edi
imul edi,esi
add eax,0x23
imul eax,edi
ret

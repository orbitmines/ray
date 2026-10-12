mov rax,QWORD PTR [rdi+0x38]
mov r9,QWORD PTR [rdi+0x30]
mov r8,rdi
cmp rsi,rax
jle 78
mov r10,QWORD PTR [rdi+0x20]
mov rdx,QWORD PTR [rdi+0x28]
jmp 65
nop DWORD PTR [rax+rax*1+0x0]
data16 cs nop WORD PTR [rax+rax*1+0x0]
data16 cs nop WORD PTR [rax+rax*1+0x0]
data16 cs nop WORD PTR [rax+rax*1+0x0]
mov rcx,QWORD PTR [r8+0x18]
movzx edi,BYTE PTR [rcx+rdx*1]
mov ecx,eax
add rdx,0x1
add rax,0x8
mov QWORD PTR [r8+0x28],rdx
shl rdi,cl
mov QWORD PTR [r8+0x38],rax
or r9,rdi
cmp rax,rsi
jge 78
cmp r10,rdx
jne 40
mov QWORD PTR [r8+0x40],0x2
xor eax,eax
ret
nop DWORD PTR [rax]
sub rax,rsi
mov ecx,esi
mov rdx,r9
mov QWORD PTR [r8+0x38],rax
mov eax,0x1
sar rdx,cl
shl rax,cl
mov QWORD PTR [r8+0x30],rdx
sub rax,0x1
and rax,r9
ret
nop DWORD PTR [rax+rax*1+0x0]
mov r9,rdx
mov r10,rcx
lea r8,[rsi+0x20]
mov rax,rsi
nop DWORD PTR [rax+rax*1+0x0]
data16 cs nop WORD PTR [rax+rax*1+0x0]
xor edx,edx
xor ecx,ecx
add rax,0x4
mov WORD PTR [rax-0x4],dx
mov WORD PTR [rax-0x2],cx
cmp rax,r8
jne c0
test r10,r10
jle 112
mov rax,r9
lea rcx,[r9+r10*2]
nop WORD PTR [rax+rax*1+0x0]
data16 cs nop WORD PTR [rax+rax*1+0x0]
data16 cs nop WORD PTR [rax+rax*1+0x0]
movsx rdx,WORD PTR [rax]
add rax,0x2
add WORD PTR [rsi+rdx*2],0x1
cmp rax,rcx
jne 100
movsx rax,WORD PTR [rsi]
xor ecx,ecx
cmp rax,r10
je 1ef
lea rax,[rsi+0x2]
mov ecx,0x1
data16 cs nop WORD PTR [rax+rax*1+0x0]
data16 cs nop WORD PTR [rax+rax*1+0x0]
movsx rdx,WORD PTR [rax]
add rcx,rcx
sub rcx,rdx
js 1ef
add rax,0x2
cmp rax,r8
jne 140
xor eax,eax
xor edx,edx
mov WORD PTR [rdi+0x3b6],ax
mov eax,0x1
nop
data16 cs nop WORD PTR [rax+rax*1+0x0]
data16 cs nop WORD PTR [rax+rax*1+0x0]
movzx r8d,WORD PTR [rsi+rax*2]
add rax,0x1
add edx,r8d
mov WORD PTR [rdi+rax*2+0x3b4],dx
cmp rax,0xf
jne 180
test r10,r10
jle 1ef
xor eax,eax
nop WORD PTR [rax+rax*1+0x0]
data16 cs nop WORD PTR [rax+rax*1+0x0]
data16 cs nop WORD PTR [rax+rax*1+0x0]
movsx rdx,WORD PTR [r9+rax*2]
test dx,dx
je 1e6
movsx rdx,WORD PTR [rdi+rdx*2+0x3b4]
mov WORD PTR [rsi+rdx*2+0x20],ax
movsx rdx,WORD PTR [r9+rax*2]
add WORD PTR [rdi+rdx*2+0x3b4],0x1
add rax,0x1
cmp r10,rax
jne 1c0
mov rax,rcx
ret
xchg ax,ax
data16 cs nop WORD PTR [rax+rax*1+0x0]
push r13
lea r10,[rsi+0x2]
xor r11d,r11d
xor r9d,r9d
push r12
mov r12,rsi
push rbp
lea rbp,[rsi+0x20]
push rbx
xor ebx,ebx
nop DWORD PTR [rax+0x0]
mov rcx,QWORD PTR [rdi+0x38]
mov rsi,QWORD PTR [rdi+0x30]
test rcx,rcx
jg 2e7
mov rdx,rcx
mov r13,QWORD PTR [rdi+0x20]
mov rax,QWORD PTR [rdi+0x28]
neg rdx
and rdx,0xfffffffffffffff8
lea r8,[rcx+rdx*1+0x8]
jmp 2a3
cs nop WORD PTR [rax+rax*1+0x0]
data16 cs nop WORD PTR [rax+rax*1+0x0]
data16 cs nop WORD PTR [rax+rax*1+0x0]
data16 cs nop WORD PTR [rax+rax*1+0x0]
data16 cs nop WORD PTR [rax+rax*1+0x0]
mov rdx,QWORD PTR [rdi+0x18]
movzx edx,BYTE PTR [rdx+rax*1]
add rax,0x1
mov QWORD PTR [rdi+0x28],rax
shl rdx,cl
add rcx,0x8
mov QWORD PTR [rdi+0x38],rcx
or rsi,rdx
cmp rcx,r8
je 2f0
cmp r13,rax
jne 280
movsx rax,WORD PTR [r10]
mov rdx,r9
mov QWORD PTR [rdi+0x40],0x2
sub rdx,rax
cmp rdx,r11
jl 317
add rbx,rax
add r10,0x2
add rax,r11
add r9,r9
lea r11,[rax+rax*1]
cmp r10,rbp
jne 220
pop rbx
mov rax,0xfffffffffffffff6
pop rbp
pop r12
pop r13
ret
mov r8,rcx
nop WORD PTR [rax+rax*1+0x0]
mov rax,rsi
and esi,0x1
sub r8,0x1
sar rax,1
or r9,rsi
mov QWORD PTR [rdi+0x38],r8
mov QWORD PTR [rdi+0x30],rax
movsx rax,WORD PTR [r10]
mov rdx,r9
sub rdx,rax
cmp rdx,r11
jge 2bf
sub rbx,r11
lea rax,[r9+rbx*1+0x10]
pop rbx
pop rbp
movsx rax,WORD PTR [r12+rax*2]
pop r12
pop r13
ret
nop DWORD PTR [rax+rax*1+0x0]
sub rsp,0x28
mov QWORD PTR [rsp],rbx
mov rbx,rdi
mov QWORD PTR [rsp+0x8],rbp
mov QWORD PTR [rsp+0x20],r14
jmp 370
nop WORD PTR [rax+rax*1+0x0]
mov rdx,QWORD PTR [rbx+0x10]
cmp rdx,QWORD PTR [rbx+0x8]
je 4c6
mov rcx,QWORD PTR [rbx]
mov BYTE PTR [rcx+rdx*1],al
mov rax,QWORD PTR [rbx+0x10]
lea rcx,[rax+0x1]
mov QWORD PTR [rbx+0x10],rcx
lea rsi,[rbx+0x3d4]
mov rdi,rbx
call 200
mov rdx,QWORD PTR [rbx+0x40]
test rdx,rdx
jne 4b0
test rax,rax
js 4b3
cmp rax,0xff
jle 350
cmp rax,0x100
je 4b0
lea rdx,[rax-0x101]
cmp rdx,0x1c
jg 4cd
movsx rsi,WORD PTR [rbx+rax*2-0x180]
movsx rbp,WORD PTR [rbx+rax*2-0x1ba]
call 0
lea rsi,[rbx+0x634]
mov rdi,rbx
mov r14,rax
call 200
mov rdx,rax
mov rax,QWORD PTR [rbx+0x40]
test rax,rax
jne 4b3
cmp rdx,0x1d
ja 4cd
movsx rsi,WORD PTR [rbx+rdx*2+0xf8]
movzx r11d,WORD PTR [rbx+rdx*2+0xbc]
call 0
mov rdx,rax
mov rax,QWORD PTR [rbx+0x40]
test rax,rax
jne 4b3
movsx rdi,r11w
add rdi,rdx
mov rdx,QWORD PTR [rbx+0x10]
cmp rdx,rdi
jl 4d6
add rbp,r14
lea rcx,[rdx+rbp*1]
cmp rcx,QWORD PTR [rbx+0x8]
jg 4c6
test rbp,rbp
jle 36c
xchg ax,ax
data16 cs nop WORD PTR [rax+rax*1+0x0]
data16 cs nop WORD PTR [rax+rax*1+0x0]
data16 cs nop WORD PTR [rax+rax*1+0x0]
data16 cs nop WORD PTR [rax+rax*1+0x0]
add rdx,rax
mov rcx,QWORD PTR [rbx]
add rax,0x1
mov rsi,rdx
sub rsi,rdi
movzx esi,BYTE PTR [rcx+rsi*1]
mov BYTE PTR [rcx+rdx*1],sil
mov rdx,QWORD PTR [rbx+0x10]
cmp rbp,rax
jne 480
lea rcx,[rbp+rdx*1+0x0]
jmp 36c
nop DWORD PTR [rax+rax*1+0x0]
mov rax,rdx
mov rbx,QWORD PTR [rsp]
mov rbp,QWORD PTR [rsp+0x8]
mov r14,QWORD PTR [rsp+0x20]
add rsp,0x28
ret
mov eax,0x1
jmp 4b3
mov rax,0xfffffffffffffff6
jmp 4b3
mov rax,0xfffffffffffffff5
jmp 4b3
nop
sub rsp,0x40
xor eax,eax
mov QWORD PTR [rsp+0x38],r15
mov r15,r8
mov QWORD PTR [rsp+0x10],rbx
mov QWORD PTR [rsp+0x18],rbp
mov QWORD PTR [rsp+0x20],r12
mov QWORD PTR [r8],rdi
mov QWORD PTR [r8+0x8],rsi
mov QWORD PTR [r8+0x10],0x0
mov QWORD PTR [r8+0x18],rdx
mov QWORD PTR [r8+0x20],rcx
mov QWORD PTR [r8+0x28],0x0
mov QWORD PTR [r8+0x30],0x0
mov QWORD PTR [r8+0x38],0x0
mov QWORD PTR [r8+0x40],0x0
nop
data16 cs nop WORD PTR [rax+rax*1+0x0]
cmp rax,0x7
jle 638
mov rdx,rax
sar rdx,0x2
sub rdx,0x1
mov WORD PTR [r15+rax*2+0x82],dx
add rax,0x1
cmp rax,0x1c
jne 540
mov eax,0x3
lea rdi,[r15+0x7e]
mov edx,0x3
mov WORD PTR [r15+0x48],ax
lea rax,[r15+0x4a]
jmp 5a4
nop WORD PTR [rax+rax*1+0x0]
data16 cs nop WORD PTR [rax+rax*1+0x0]
data16 cs nop WORD PTR [rax+rax*1+0x0]
add rax,0x2
movsx ecx,WORD PTR [rax+0x38]
mov ebx,0x1
shl ebx,cl
add edx,ebx
mov WORD PTR [rax],dx
cmp rax,rdi
jne 5a0
mov ebp,0x102
xor r12d,r12d
xor eax,eax
mov WORD PTR [r15+0x80],bp
mov WORD PTR [r15+0xba],r12w
jmp 61c
cs nop WORD PTR [rax+rax*1+0x0]
data16 cs nop WORD PTR [rax+rax*1+0x0]
data16 cs nop WORD PTR [rax+rax*1+0x0]
data16 cs nop WORD PTR [rax+rax*1+0x0]
mov rdx,rax
sar rdx,1
sub edx,0x1
mov WORD PTR [r15+rax*2+0xf8],dx
add rax,0x1
cmp rax,0x1e
je 64c
cmp rax,0x1
jg 600
xor ebx,ebx
mov WORD PTR [r15+rax*2+0xf8],bx
add rax,0x1
jmp 61c
nop DWORD PTR [rax+rax*1+0x0]
xor edx,edx
mov WORD PTR [r15+rax*2+0x82],dx
add rax,0x1
jmp 540
mov r11d,0x1
lea rax,[r15+0xbe]
mov edx,0x1
mov WORD PTR [r15+0xbc],r11w
lea rdi,[r15+0xf6]
jmp 684
nop WORD PTR [rax+rax*1+0x0]
data16 cs nop WORD PTR [rax+rax*1+0x0]
add rax,0x2
movsx ecx,WORD PTR [rax+0x3a]
mov ebx,0x1
shl ebx,cl
add edx,ebx
mov WORD PTR [rax],dx
cmp rax,rdi
jne 680
xor ecx,ecx
xor edi,edi
nop DWORD PTR [rax]
test rcx,rcx
jg 96e
mov rax,rcx
mov r9,QWORD PTR [r15+0x20]
mov rdx,QWORD PTR [r15+0x28]
mov rbx,rdi
neg rax
and rax,0xfffffffffffffff8
lea rax,[rcx+rax*1+0x8]
jmp 727
nop DWORD PTR [rax+0x0]
data16 cs nop WORD PTR [rax+rax*1+0x0]
data16 cs nop WORD PTR [rax+rax*1+0x0]
data16 cs nop WORD PTR [rax+rax*1+0x0]
data16 cs nop WORD PTR [rax+rax*1+0x0]
data16 cs nop WORD PTR [rax+rax*1+0x0]
mov rsi,QWORD PTR [r15+0x18]
movzx esi,BYTE PTR [rsi+rdx*1]
add rdx,0x1
mov QWORD PTR [r15+0x28],rdx
shl rsi,cl
add rcx,0x8
mov QWORD PTR [r15+0x38],rcx
or rbx,rsi
cmp rcx,rax
je 980
cmp r9,rdx
jne 700
mov QWORD PTR [r15+0x40],0x2
mov rcx,QWORD PTR [r15+0x38]
xor ebx,ebx
cmp rcx,0x1
jg 7d8
mov rsi,QWORD PTR [r15+0x20]
mov rax,QWORD PTR [r15+0x28]
jmp 7a4
nop WORD PTR [rax+rax*1+0x0]
data16 cs nop WORD PTR [rax+rax*1+0x0]
data16 cs nop WORD PTR [rax+rax*1+0x0]
data16 cs nop WORD PTR [rax+rax*1+0x0]
data16 cs nop WORD PTR [rax+rax*1+0x0]
mov rdx,QWORD PTR [r15+0x18]
movzx edx,BYTE PTR [rdx+rax*1]
add rax,0x1
mov QWORD PTR [r15+0x28],rax
shl rdx,cl
add rcx,0x8
mov QWORD PTR [r15+0x38],rcx
or rdi,rdx
cmp rcx,0x1
jg 7d8
cmp rsi,rax
jne 780
mov QWORD PTR [r15+0x40],0x2
mov rax,0xffffffffffffff9a
mov rbx,QWORD PTR [rsp+0x10]
mov rbp,QWORD PTR [rsp+0x18]
mov r12,QWORD PTR [rsp+0x20]
mov r15,QWORD PTR [rsp+0x38]
add rsp,0x40
ret
nop DWORD PTR [rax+0x0]
mov r9,rdi
mov rdx,QWORD PTR [r15+0x40]
sub rcx,0x2
sar r9,0x2
mov QWORD PTR [r15+0x38],rcx
mov QWORD PTR [r15+0x30],r9
test rdx,rdx
jne e46
and edi,0x3
je b68
cmp rdi,0x1
je ca3
cmp rdi,0x2
jne 1166
cmp rcx,0x4
jg c73
mov rsi,QWORD PTR [r15+0x20]
mov rax,QWORD PTR [r15+0x28]
mov r12,r9
jmp 868
nop WORD PTR [rax+rax*1+0x0]
data16 cs nop WORD PTR [rax+rax*1+0x0]
mov rdx,QWORD PTR [r15+0x18]
movzx edx,BYTE PTR [rdx+rax*1]
add rax,0x1
mov QWORD PTR [r15+0x28],rax
shl rdx,cl
add rcx,0x8
mov QWORD PTR [r15+0x38],rcx
or r12,rdx
cmp rcx,0x4
jg c80
cmp rsi,rax
jne 840
mov QWORD PTR [r15+0x40],0x2
mov rcx,QWORD PTR [r15+0x38]
mov r12d,0x101
cmp rcx,0x4
jg c4b
mov rsi,QWORD PTR [r15+0x20]
mov rax,QWORD PTR [r15+0x28]
mov rbp,r9
jmp 8e8
nop WORD PTR [rax+rax*1+0x0]
data16 cs nop WORD PTR [rax+rax*1+0x0]
data16 cs nop WORD PTR [rax+rax*1+0x0]
data16 cs nop WORD PTR [rax+rax*1+0x0]
mov rdx,QWORD PTR [r15+0x18]
movzx edx,BYTE PTR [rdx+rax*1]
add rax,0x1
mov QWORD PTR [r15+0x28],rax
shl rdx,cl
add rcx,0x8
mov QWORD PTR [r15+0x38],rcx
or rbp,rdx
cmp rcx,0x4
jg c50
cmp rax,rsi
jne 8c0
mov QWORD PTR [r15+0x40],0x2
mov rcx,QWORD PTR [r15+0x38]
mov QWORD PTR [rsp],0x1
cmp rcx,0x3
jg 9a0
mov rsi,QWORD PTR [r15+0x20]
mov rax,QWORD PTR [r15+0x28]
jmp 964
cs nop WORD PTR [rax+rax*1+0x0]
data16 cs nop WORD PTR [rax+rax*1+0x0]
data16 cs nop WORD PTR [rax+rax*1+0x0]
data16 cs nop WORD PTR [rax+rax*1+0x0]
mov rdx,QWORD PTR [r15+0x18]
movzx edx,BYTE PTR [rdx+rax*1]
add rax,0x1
mov QWORD PTR [r15+0x28],rax
shl rdx,cl
add rcx,0x8
mov QWORD PTR [r15+0x38],rcx
or r9,rdx
cmp rcx,0x3
jg 9a0
cmp rsi,rax
jne 940
jmp 7a9
mov rbx,rdi
mov rax,rcx
nop
data16 cs nop WORD PTR [rax+rax*1+0x0]
mov rdi,rbx
lea rcx,[rax-0x1]
and ebx,0x1
sar rdi,1
mov QWORD PTR [r15+0x38],rcx
mov QWORD PTR [r15+0x30],rdi
jmp 73a
nop WORD PTR [rax+rax*1+0x0]
mov rsi,r9
mov rdx,QWORD PTR [r15+0x40]
sub rcx,0x4
sar rsi,0x4
mov QWORD PTR [r15+0x38],rcx
mov QWORD PTR [r15+0x30],rsi
test rdx,rdx
jne e46
cmp r12,0x11e
jg 11c8
cmp QWORD PTR [rsp],0x1e
jg 11c8
and r9d,0xf
xor r10d,r10d
add r9,0x4
cmp rcx,0x2
jg a80
nop DWORD PTR [rax]
mov rdi,QWORD PTR [r15+0x20]
mov rax,QWORD PTR [r15+0x28]
jmp a24
nop WORD PTR [rax+rax*1+0x0]
mov rdx,QWORD PTR [r15+0x18]
movzx edx,BYTE PTR [rdx+rax*1]
add rax,0x1
mov QWORD PTR [r15+0x28],rax
shl rdx,cl
add rcx,0x8
mov QWORD PTR [r15+0x38],rcx
or rsi,rdx
cmp rcx,0x2
jg a80
cmp rdi,rax
jne a00
mov QWORD PTR [r15+0x40],0x2
xor esi,esi
cmp r10,0x2
jle a9c
xor eax,eax
cmp r10,0x3
je a5b
mov rax,r10
mov edx,0x9
sar rax,1
sub rdx,rax
add rax,0x6
test r10b,0x1
cmovne rax,rdx
mov WORD PTR [r15+rax*2+0x134],si
add r10,0x1
cmp r9,r10
je ad0
mov rcx,QWORD PTR [r15+0x38]
mov rsi,QWORD PTR [r15+0x30]
cmp rcx,0x2
jle 9f0
nop
mov rax,rsi
sub rcx,0x3
and esi,0x7
sar rax,0x3
mov QWORD PTR [r15+0x38],rcx
mov QWORD PTR [r15+0x30],rax
cmp r10,0x2
jg a39
mov WORD PTR [r15+r10*2+0x154],si
add r10,0x1
jmp a6d
cs nop WORD PTR [rax+rax*1+0x0]
data16 cs nop WORD PTR [rax+rax*1+0x0]
xor r8d,r8d
add r9,0x1
mov WORD PTR [r15+rax*2+0x140],r8w
cmp r9,0x13
je b20
mov rax,r9
sar rax,1
test r9b,0x1
je ac0
mov edx,0x9
add r9,0x1
xor r10d,r10d
sub rdx,rax
mov rax,r9
mov WORD PTR [r15+rdx*2+0x134],r10w
sar rax,1
test r9b,0x1
jne ae2
xor r8d,r8d
add r9,0x1
mov WORD PTR [r15+rax*2+0x140],r8w
jmp ad0
nop DWORD PTR [rax+rax*1+0x0]
mov rdx,QWORD PTR [r15+0x40]
test rdx,rdx
jne e46
lea rax,[r15+0x134]
mov ecx,0x13
lea rsi,[r15+0x3d4]
mov rdi,r15
mov rdx,rax
mov QWORD PTR [rsp+0x8],rax
call a0
mov rbp,rax
test rax,rax
je e61
mov rax,0xffffffffffffffa0
jmp 7b8
mov rsi,QWORD PTR [r15+0x28]
mov r10,QWORD PTR [r15+0x20]
mov QWORD PTR [r15+0x30],0x0
mov QWORD PTR [r15+0x38],0x0
lea rcx,[rsi+0x4]
cmp rcx,r10
jg 7b1
mov rax,QWORD PTR [r15+0x18]
movzx r9d,BYTE PTR [rax+rsi*1+0x1]
movzx edx,BYTE PTR [rax+rsi*1]
shl r9d,0x8
or r9d,edx
movzx edx,BYTE PTR [rax+rsi*1+0x3]
movzx esi,BYTE PTR [rax+rsi*1+0x2]
mov QWORD PTR [r15+0x28],rcx
shl edx,0x8
or edx,esi
xor edx,0xffff
cmp r9d,edx
jne 11ab
mov esi,r9d
lea r11,[rcx+rsi*1]
cmp r10,r11
jl 7b1
mov rdx,QWORD PTR [r15+0x10]
lea r10,[rsi+rdx*1]
cmp r10,QWORD PTR [r15+0x8]
jg e55
test r9d,r9d
jne c04
jmp c2d
nop DWORD PTR [rax+rax*1+0x0]
data16 cs nop WORD PTR [rax+rax*1+0x0]
mov rax,QWORD PTR [r15+0x18]
add rax,rdi
movzx ecx,BYTE PTR [rax+rcx*1]
mov rax,QWORD PTR [r15]
add rax,rdi
add rdi,0x1
mov BYTE PTR [rax+rdx*1],cl
mov rdx,QWORD PTR [r15+0x10]
mov rcx,QWORD PTR [r15+0x28]
cmp rsi,rdi
jne c00
lea r10,[rsi+rdx*1]
lea r11,[rsi+rcx*1]
mov QWORD PTR [r15+0x10],r10
mov QWORD PTR [r15+0x28],r11
test rbx,rbx
jne 115d
mov rdi,QWORD PTR [r15+0x30]
mov rcx,QWORD PTR [r15+0x38]
jmp 6a0
mov rbp,r9
xchg ax,ax
mov r9,rbp
and ebp,0x1f
sub rcx,0x5
sar r9,0x5
lea rax,[rbp+0x1]
mov QWORD PTR [r15+0x38],rcx
mov QWORD PTR [r15+0x30],r9
mov QWORD PTR [rsp],rax
jmp 901
mov r12,r9
cs nop WORD PTR [rax+rax*1+0x0]
mov r9,r12
sub rcx,0x5
and r12d,0x1f
sar r9,0x5
mov QWORD PTR [r15+0x38],rcx
add r12,0x101
mov QWORD PTR [r15+0x30],r9
jmp 87f
lea rbp,[r15+0x134]
lea rdx,[r15+0x254]
mov r11,rbp
mov rax,rbp
nop WORD PTR [rax+rax*1+0x0]
mov r9d,0x8
mov r10d,0x8
add rax,0x4
mov WORD PTR [rax-0x4],r9w
mov WORD PTR [rax-0x2],r10w
cmp rdx,rax
jne cc0
lea rax,[r15+0x334]
mov rcx,rax
sub rcx,rdx
and ecx,0x2
je d20
mov ecx,0x9
add rdx,0x2
mov WORD PTR [r15+0x254],cx
cmp rax,rdx
je d3d
nop DWORD PTR [rax]
data16 cs nop WORD PTR [rax+rax*1+0x0]
data16 cs nop WORD PTR [rax+rax*1+0x0]
mov edi,0x9
mov r8d,0x9
add rdx,0x4
mov WORD PTR [rdx-0x4],di
mov WORD PTR [rdx-0x2],r8w
cmp rax,rdx
jne d20
lea rdx,[r15+0x364]
mov rcx,rdx
sub rcx,rax
and ecx,0x2
je d80
mov esi,0x7
add rax,0x2
mov WORD PTR [r15+0x334],si
cmp rdx,rax
je d9b
nop DWORD PTR [rax+rax*1+0x0]
data16 cs nop WORD PTR [rax+rax*1+0x0]
data16 cs nop WORD PTR [rax+rax*1+0x0]
mov ecx,0x7
mov esi,0x7
add rax,0x4
mov WORD PTR [rax-0x4],cx
mov WORD PTR [rax-0x2],si
cmp rdx,rax
jne d80
movabs rax,0x8000800080008
mov rdx,rbp
mov ecx,0x120
mov rdi,r15
mov QWORD PTR [r15+0x364],rax
lea rsi,[r15+0x3d4]
mov QWORD PTR [r15+0x36c],rax
call a0
lea rax,[r15+0x170]
mov rdx,rax
sub rdx,rbp
and edx,0x2
je e00
mov edi,0x5
lea r11,[rbp+0x2]
mov WORD PTR [r15+0x134],di
cmp r11,rax
je e1e
nop DWORD PTR [rax]
data16 cs nop WORD PTR [rax+rax*1+0x0]
mov r12d,0x5
mov edx,0x5
add r11,0x4
mov WORD PTR [r11-0x4],r12w
mov WORD PTR [r11-0x2],dx
cmp r11,rax
jne e00
mov rdx,rbp
lea rsi,[r15+0x634]
mov ecx,0x1e
mov rdi,r15
call a0
call 330
mov rdx,rax
test rdx,rdx
je c35
mov rax,0xffffffffffffff9c
sub rax,rdx
jmp 7b8
mov rax,0xffffffffffffff9b
jmp 7b8
mov rax,QWORD PTR [rsp]
mov QWORD PTR [rsp+0x30],r14
lea r14,[rax+r12*1]
jmp e86
mov WORD PTR [r15+rbp*2+0x134],ax
add rbp,0x1
cmp rbp,r14
jge 1023
lea rsi,[r15+0x3d4]
mov rdi,r15
call 200
mov rsi,QWORD PTR [r15+0x40]
mov rdi,rax
test rsi,rsi
jne 1172
test rax,rax
js 1186
cmp rax,0xf
jle e70
cmp rax,0x10
je f40
mov rax,QWORD PTR [r15+0x30]
mov rcx,QWORD PTR [r15+0x38]
cmp rdi,0x11
je 10c1
cmp rcx,0x6
jg fb3
mov r10,QWORD PTR [r15+0x20]
mov rdi,QWORD PTR [r15+0x28]
jmp f29
nop WORD PTR [rax+rax*1+0x0]
data16 cs nop WORD PTR [rax+rax*1+0x0]
data16 cs nop WORD PTR [rax+rax*1+0x0]
mov r9,QWORD PTR [r15+0x18]
movzx r9d,BYTE PTR [r9+rdi*1]
add rdi,0x1
mov QWORD PTR [r15+0x28],rdi
shl r9,cl
add rcx,0x8
mov QWORD PTR [r15+0x38],rcx
or rax,r9
cmp rcx,0x6
jg fb3
cmp rdi,r10
jne f00
mov QWORD PTR [r15+0x40],0x2
mov r14,QWORD PTR [rsp+0x30]
jmp 7b1
test rbp,rbp
je 11b7
mov rcx,QWORD PTR [r15+0x38]
mov rax,QWORD PTR [r15+0x30]
movsx rsi,WORD PTR [r15+rbp*2+0x132]
cmp rcx,0x1
jg 112f
mov r10,QWORD PTR [r15+0x20]
mov rdi,QWORD PTR [r15+0x28]
jmp fa9
nop DWORD PTR [rax+0x0]
data16 cs nop WORD PTR [rax+rax*1+0x0]
mov r9,QWORD PTR [r15+0x18]
movzx r9d,BYTE PTR [r9+rdi*1]
add rdi,0x1
mov QWORD PTR [r15+0x28],rdi
shl r9,cl
add rcx,0x8
mov QWORD PTR [r15+0x38],rcx
or rax,r9
cmp rcx,0x1
jg 112f
cmp rdi,r10
jne f80
jmp f2e
mov rdi,rax
and eax,0x7f
sub rcx,0x7
sar rdi,0x7
add rax,0xb
add rax,rbp
mov QWORD PTR [r15+0x30],rdi
mov QWORD PTR [r15+0x38],rcx
cmp rax,r14
jg 119a
lea rdi,[r15+rax*2]
lea rdx,[r15+rbp*2]
mov ecx,esi
mov r9,rdi
sub r9,rdx
and r9d,0x2
je 1000
mov WORD PTR [rdx+0x134],si
add rdx,0x2
cmp rdi,rdx
je 1017
nop
mov WORD PTR [rdx+0x134],cx
add rdx,0x4
mov WORD PTR [rdx+0x132],cx
cmp rdi,rdx
jne 1000
mov rbp,rax
cmp rbp,r14
jl e86
cmp WORD PTR [r15+0x334],0x0
je 11d4
mov rdx,QWORD PTR [rsp+0x8]
mov rcx,r12
lea rsi,[r15+0x3d4]
mov rdi,r15
call a0
test rax,rax
js 11f6
je 106c
movsx rdx,WORD PTR [r15+0x3d4]
mov rax,r12
sub rax,rdx
cmp rax,0x1
jne 11f6
mov rax,QWORD PTR [rsp+0x8]
mov rcx,QWORD PTR [rsp]
lea rsi,[r15+0x634]
mov rdi,r15
lea rdx,[rax+r12*2]
call a0
test rax,rax
js 11e5
je 10ac
movsx rax,WORD PTR [r15+0x634]
mov rbp,QWORD PTR [rsp]
sub rbp,rax
cmp rbp,0x1
jne 11e5
mov rdi,r15
call 330
mov r14,QWORD PTR [rsp+0x30]
mov rdx,rax
jmp e3d
cmp rcx,0x2
jg 1146
mov r10,QWORD PTR [r15+0x20]
mov rdi,QWORD PTR [r15+0x28]
jmp 1125
nop DWORD PTR [rax]
data16 cs nop WORD PTR [rax+rax*1+0x0]
data16 cs nop WORD PTR [rax+rax*1+0x0]
data16 cs nop WORD PTR [rax+rax*1+0x0]
data16 cs nop WORD PTR [rax+rax*1+0x0]
mov r9,QWORD PTR [r15+0x18]
movzx r9d,BYTE PTR [r9+rdi*1]
add rdi,0x1
mov QWORD PTR [r15+0x28],rdi
shl r9,cl
add rcx,0x8
mov QWORD PTR [r15+0x38],rcx
or rax,r9
cmp rcx,0x2
jg 1146
cmp r10,rdi
jne 1100
jmp f2e
mov rdi,rax
and eax,0x3
sub rcx,0x2
sar rdi,0x2
add rax,0x3
jmp fc5
mov rdi,rax
and eax,0x7
sub rcx,0x3
sar rdi,0x3
add rax,0x3
jmp fc5
mov rax,QWORD PTR [r15+0x10]
jmp 7b8
mov rax,0xffffffffffffff9d
jmp 7b8
mov rax,0xffffffffffffff9c
mov r14,QWORD PTR [rsp+0x30]
sub rax,rsi
jmp 7b8
mov rax,0xffffffffffffff9c
mov r14,QWORD PTR [rsp+0x30]
sub rax,rdi
jmp 7b8
mov r14,QWORD PTR [rsp+0x30]
mov rax,0xffffffffffffffa2
jmp 7b8
mov rax,0xffffffffffffff9e
jmp 7b8
mov r14,QWORD PTR [rsp+0x30]
mov rax,0xffffffffffffffa1
jmp 7b8
mov rax,0xffffffffffffff9f
jmp 7b8
mov r14,QWORD PTR [rsp+0x30]
mov rax,0xffffffffffffffa5
jmp 7b8
mov r14,QWORD PTR [rsp+0x30]
mov rax,0xffffffffffffffa4
jmp 7b8
mov r14,QWORD PTR [rsp+0x30]
mov rax,0xffffffffffffffa3
jmp 7b8

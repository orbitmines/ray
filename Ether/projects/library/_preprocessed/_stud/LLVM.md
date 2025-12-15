
- [[Clang]]

---

https://gist.github.com/junkdog/70231d6953592cd6f27def59fe19e50d




```
sudo update-alternatives --install /usr/bin/clang clang /usr/bin/clang-17 100

./register_clang_version.sh 17 100
```

```
The proper way to use clang as your default `cc` and `c++` is to use [`update-alternatives`](http://linux.die.net/man/8/update-alternatives):

> It is possible for several programs fulfilling the same or similar functions to be installed on a single system at the same time. For example, many systems have several text editors installed at once. This gives choice to the users of a system, allowing each to use a different editor, if desired, but makes it difficult for a program to make a good choice of editor to invoke if the user has not specified a particular preference.

so first you need to add `clang-3.5` or `clang++-3.5` as alternatives to e.g. `gcc` and `g++`:

```
sudo update-alternatives --install /usr/bin/cc cc /usr/bin/clang-3.5 100
sudo update-alternatives --install /usr/bin/c++ c++ /usr/bin/clang++-3.5 100
```

If at any time you need to switch back to `gcc` or `g++` you can use the `--config` option:

```
sudo update-alternatives --config c++
```
```

Install

https://apt.llvm.org/



```bash
For convenience there is an automatic installation script available that installs LLVM for you.  
To install the latest stable version:

bash -c "$(wget -O - https://apt.llvm.org/llvm.sh)"

  
To install a specific version of LLVM:

wget https://apt.llvm.org/llvm.sh
chmod +x llvm.sh
sudo ./llvm.sh <version number>

To install all apt.llvm.org packages at once:

wget https://apt.llvm.org/llvm.sh
chmod +x llvm.sh
sudo ./llvm.sh <version number> all
# or
sudo ./llvm.sh all
```

```bash
wget -O - https://apt.llvm.org/llvm-snapshot.gpg.key | sudo apt-key add -  
# or  
wget -qO- https://apt.llvm.org/llvm-snapshot.gpg.key | sudo tee /etc/apt/trusted.gpg.d/apt.llvm.org.asc  
# Fingerprint: 6084 F3CF 814B 57C1 CF12 EFD5 15CF 4D18 AF4F 7421
```


```bash
**# LLVM**  
apt-get install libllvm-16-ocaml-dev libllvm16 llvm-16 llvm-16-dev llvm-16-doc llvm-16-examples llvm-16-runtime  
**# Clang and co**  
apt-get install clang-16 clang-tools-16 clang-16-doc libclang-common-16-dev libclang-16-dev libclang1-16 clang-format-16 python3-clang-16 clangd-16 clang-tidy-16  
**# compiler-rt**  
apt-get install libclang-rt-16-dev  
**# polly**  
apt-get install libpolly-16-dev  
**# libfuzzer**  
apt-get install libfuzzer-16-dev  
**# lldb**  
apt-get install lldb-16  
**# lld (linker)**  
apt-get install lld-16  
**# libc++**  
apt-get install libc++-16-dev libc++abi-16-dev  
**# OpenMP**  
apt-get install libomp-16-dev  
**# libclc**  
apt-get install libclc-16-dev  
**# libunwind**  
apt-get install libunwind-16-dev  
**# mlir**  
apt-get install libmlir-16-dev mlir-16-tools  
**# bolt**  
apt-get install libbolt-16-dev bolt-16  
**# flang**  
apt-get install flang-16  
**# wasm support**  
apt-get install libclang-rt-16-dev-wasm32 libclang-rt-16-dev-wasm64 libc++-16-dev-wasm32 libc++abi-16-dev-wasm32 libclang-rt-16-dev-wasm32 libclang-rt-16-dev-wasm64
```
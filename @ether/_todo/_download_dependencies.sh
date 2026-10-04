pwd=$PWD

# TODO Rewrite in Ray, with the cache system in place for all the things like the github repos (for like individual files as well).

# For compiling the app
# sudo apt-get install libwebkit2gtk-4.1-dev libjavascriptcoregtk-4.1-dev
# For AppImage: sudo apt-get install librsvg2-dev
# for windows (from windows): rustup target add x86_64-pc-windows-msvc
# for windows (from linux): sudo apt-get install gcc-mingw-w64-x86-64 && rustup target add x86_64-pc-windows-gnu && sudo apt-get install nsis (+ sudo apt-get install llvm )

# TODO Use the basis for the OM script, or wait till we write this in .ray.txt

set -e

DEPENDENCIES_DIR="./ar.ray/ray.ray.txt/Ether/instance/dependencies"

TZDATA_TAR=".orbitmines/external/data.iana.org/time-zones/tzdata-latest.tar.gz"
TZDATA_DIR="$DEPENDENCIES_DIR/tzdata"
mkdir -p "$(dirname "$TZDATA_TAR")"
mkdir -p $TZDATA_DIR
curl -L https://data.iana.org/time-zones/tzdata-latest.tar.gz -o $TZDATA_TAR
tar -xzf $TZDATA_TAR -C $TZDATA_DIR

function clone() {
  if [ -d "$2" ]; then
    cd $2 && git pull
    cd $pwd
  else
    git clone $1 $2
  fi
}

clone "https://github.com/notofonts/notofonts.github.io" ".orbitmines/external/github.com/notofonts/notofonts.github.io"
clone "https://github.com/notofonts/noto-cjk" ".orbitmines/external/github.com/notofonts/noto-cjk"
clone "https://github.com/googlefonts/noto-emoji" ".orbitmines/external/github.com/googlefonts/noto-emoji"

FONT_DIR="./ar.ray/ray.html/lib/fonts"

declare -a cjk=("Japanese" "Korean" "SimplifiedChinese" "TraditionalChinese" "TraditionalChineseHK")
for font in "${cjk[@]}"
do
  mkdir -p "$FONT_DIR/NotoSans$font/otf"
  cp -r ".orbitmines/external/github.com/notofonts/noto-cjk/Sans/OTF/$font/." "$FONT_DIR/NotoSans$font/otf"
done



find ".orbitmines/external/github.com/notofonts/notofonts.github.io/fonts" -mindepth 1 -maxdepth 1 -type d | while read -r path; do
  font=$(basename "$path")

  mkdir -p "$FONT_DIR/$font/otf"
  mkdir -p "$FONT_DIR/$font/ttf"

  cp -r ".orbitmines/external/github.com/notofonts/notofonts.github.io/fonts/$font/unhinted/otf/." "$FONT_DIR/$font/otf"
  cp -r ".orbitmines/external/github.com/notofonts/notofonts.github.io/fonts/$font/unhinted/ttf/." "$FONT_DIR/$font/ttf"

done

mkdir -p "$FONT_DIR/NotoColorEmoji/ttf"
cp -r ".orbitmines/external/github.com/googlefonts/noto-emoji/fonts/NotoColorEmoji.ttf" "$FONT_DIR/NotoColorEmoji/ttf"

# TODO: Where's the emoji monochrome? Can manually download from here but there's no link/github repo. https://fonts.google.com/noto/specimen/Noto+Emoji
#mkdir -p "$FONT_DIR/NotoEmoji/"



# Add all in-repository files
git add "$DEPENDENCIES_DIR/"
git add "$FONT_DIR/"


# TODO Models
# Download https://git-lfs.com/
# git lfs install
# git clone git@hf.co:meta-llama/Llama-4-Scout-17B-16E-Instruct
# git clone git@hf.co:meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8
# git clone git@hf.co:mistralai/Voxtral-Mini-3B-2507
# etc... Allow any huggingface model configured somewhere. What's the default?

# Install cmake, requirement for clang

# clang, to use tinygrad clang
# git clone git@github.com:llvm/llvm-project.git
# cd llvm-project
# mkdir build
# cd build
# cmake -DLLVM_ENABLE_PROJECTS=clang -DCMAKE_BUILD_TYPE=Release -G "Unix Makefiles" ../llvm
# make
# or bash -c "$(wget -O - https://apt.llvm.org/llvm.sh)"

# Wasm compiling requirement (https://emscripten.org/docs/getting_started/downloads.html)
# git clone https://github.com/emscripten-core/emsdk.git
# ./emsdk install latest
# ./emsdk activate latest

# WebGPU runtime
# sudo curl -L https://github.com/wpmed92/pydawn/releases/download/v0.3.0/libwebgpu_dawn_x86_64.so -o /usr/lib/libdawn.so
# sudo curl -L https://github.com/wpmed92/pydawn/releases/download/v0.3.0/libwebgpu_dawn_x86_64.so -o /usr/lib/libwebgpu_dawn.so

# git clone git@github.com:tinygrad/tinygrad.git
# cd tinygrad
# python3 -m venv .venv
# source .venv/bin/activate
# python3 -m pip install -e .

# MacOS development on linux
# https://github.com/kholia/OSX-KVM
# sudo apt-get install qemu-system uml-utilities virt-manager git \
  #    wget libguestfs-tools p7zip-full make dmg2img tesseract-ocr \
  #    tesseract-ocr-eng genisoimage vim net-tools screen -y

# Clone in .orbitmines/github.com/kholia
# git clone --depth 1 --recursive https://github.com/kholia/OSX-KVM.git
  #
  #cd OSX-KVM

# sudo usermod -aG kvm $(whoami)
  #sudo usermod -aG libvirt $(whoami)
  #sudo usermod -aG input $(whoami)

# dmg2img -i BaseSystem.dmg BaseSystem.img
# qemu-img create -f qcow2 mac_hdd_ng.img 256G

# Big Sur works, Sonoma and Sequoia dont

# Format the unidentified disk
# Reinstall
# On first reboot when installing, click Installer not base System
# Then 2nd reboot, boot from the disk created.

# config.plist
# Set <key>SecureBootModel</key>
      #			<string>Default</string>
# AllowSetDefault => true

# rm -f OpenCore.qcow2; sudo ./opencore-image-ng.sh --cfg config.plist --img OpenCore.qcow2

# git clone https://github.com/corpnewt/GenSMBIOS
# cd GenSMBIOS
# ./GenSMBIOS.command

# SystemProductName iMac20,1
# SystemSerialNumber
# SystemUUID
# MLB = Board Serial
# +ROM, set Mac of network device to it.
pwd=$PWD

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

# WebGPU runtime
# sudo curl -L https://github.com/wpmed92/pydawn/releases/download/v0.3.0/libwebgpu_dawn_x86_64.so -o /usr/lib/libdawn.so
# sudo curl -L https://github.com/wpmed92/pydawn/releases/download/v0.3.0/libwebgpu_dawn_x86_64.so -o /usr/lib/libwebgpu_dawn.so

# git clone git@github.com:tinygrad/tinygrad.git
# cd tinygrad
# python3 -m venv .venv
# source .venv/bin/activate
# python3 -m pip install -e .
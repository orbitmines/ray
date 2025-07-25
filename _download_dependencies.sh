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


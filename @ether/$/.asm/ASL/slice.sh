#!/bin/bash
# The slice of Arm's A64 XML that is read as source: register diagrams, the encodings that refine them, and the
# pseudocode sections. Lines are taken verbatim, except that the pseudocode is given back as the plain ASL it is:
# the links Arm's XML wraps names in are taken off, and `&lt;` `&gt;` `&quot;` `&amp;` are the characters again.
#   slice.sh [instruction files...]      one A64.<file>.xml each
#   SHARED="AddWithCarry ConditionHolds" slice.sh   also A64.shared.xml: those functions of shared_pseudocode.xml
R=$(git rev-parse --show-toplevel)
X=$R/.ether/external/arm/ISA_A64_xml_A_profile-2026-06
O=${O:-$R/.ether/asm/work/arm/slices}; mkdir -p $O
plain() { sed -e 's/<a link="[^"]*" file="[^"]*">//g; s/<\/a>//g; s/<anchor link="[^"]*">//g; s/<\/anchor>//g' \
              -e 's/\(<pstext [^>]*>\)/\1\n/; s/<\/pstext><\/ps>/\n<\/pstext><\/ps>/' \
              -e '/<ps /!{s/&lt;/</g; s/&gt;/>/g; s/&quot;/"/g; s/&amp;/\&/g}'; }
for f in ${@:-add_addsub_imm movz b_uncond b_cond ret ldr_imm_gen subs_addsub_imm}; do
  awk '/<regdiagram /,/<\/regdiagram>/ {print; next} /<encoding /,/<\/encoding>/ {print; next} /<ps /,/<\/ps>/ {print}' "$X/$f.xml" > "$O/A64.$f.xml.tmp"
  awk '/<ps /{p=1} !p{print} p{print | "cat > /dev/stderr"} /<\/ps>/{p=0}' "$O/A64.$f.xml.tmp" > "$O/A64.$f.xml" 2> "$O/ps.tmp"
  plain < "$O/ps.tmp" >> "$O/A64.$f.xml"; rm -f "$O/A64.$f.xml.tmp" "$O/ps.tmp"
done
if [ -n "$SHARED" ]; then
  : > "$O/A64.shared.xml"
  for name in $SHARED; do
    awk -v want="$name" '/<ps name="/ { split($0, a, "\""); n = a[2]; sub(/.*\//, "", n); p = (n == want) } p {print} /<\/ps>/ {p=0}' "$X/shared_pseudocode.xml" | plain >> "$O/A64.shared.xml"
  done
fi
wc -l $O/*

"""WordPiece tokenizer (pure Python, from vocab.txt).

Compatible with BERT/NomicBERT tokenization.
"""
from __future__ import annotations

import re
import unicodedata
from pathlib import Path

# Special tokens
PAD_TOKEN = "[PAD]"
UNK_TOKEN = "[UNK]"
CLS_TOKEN = "[CLS]"
SEP_TOKEN = "[SEP]"


class WordPieceTokenizer:
    """Pure Python WordPiece tokenizer that reads vocab.txt."""

    def __init__(self, vocab_path: str, max_length: int = 8192):
        self.max_length = max_length
        self.vocab: dict[str, int] = {}
        self.inv_vocab: dict[int, str] = {}

        with open(vocab_path) as f:
            for idx, line in enumerate(f):
                token = line.rstrip("\n")
                self.vocab[token] = idx
                self.inv_vocab[idx] = token

        self.pad_id = self.vocab.get(PAD_TOKEN, 0)
        self.unk_id = self.vocab.get(UNK_TOKEN, 100)
        self.cls_id = self.vocab.get(CLS_TOKEN, 101)
        self.sep_id = self.vocab.get(SEP_TOKEN, 102)

    def tokenize(self, text: str) -> list[str]:
        """Tokenize text into WordPiece tokens."""
        tokens = []
        for word in self._basic_tokenize(text):
            sub_tokens = self._wordpiece_tokenize(word)
            tokens.extend(sub_tokens)
        return tokens

    def encode(self, text: str) -> tuple[list[int], list[int]]:
        """Encode text to token IDs and attention mask (unpadded).

        Returns:
            (input_ids, attention_mask) - truncated to max_length but NOT padded.
        """
        tokens = self.tokenize(text)
        # Truncate to max_length - 2 (for CLS and SEP)
        max_tokens = self.max_length - 2
        tokens = tokens[:max_tokens]

        # Build input_ids: [CLS] + tokens + [SEP]
        input_ids = [self.cls_id]
        for t in tokens:
            input_ids.append(self.vocab.get(t, self.unk_id))
        input_ids.append(self.sep_id)

        # Build attention mask
        attention_mask = [1] * len(input_ids)

        return input_ids, attention_mask

    def batch_encode(self, texts: list[str]) -> tuple[list[list[int]], list[list[int]]]:
        """Encode a batch of texts, padding to the max length in the batch.

        Returns:
            (all_input_ids, all_attention_masks) - padded to batch max length.
        """
        encoded = [self.encode(text) for text in texts]
        # Pad to the longest sequence in this batch (not global max_length)
        max_len = max(len(ids) for ids, _ in encoded) if encoded else 0
        all_ids = []
        all_masks = []
        for ids, mask in encoded:
            pad_len = max_len - len(ids)
            all_ids.append(ids + [self.pad_id] * pad_len)
            all_masks.append(mask + [0] * pad_len)
        return all_ids, all_masks

    def _basic_tokenize(self, text: str) -> list[str]:
        """Basic tokenization: lowercase, strip accents, split on punctuation/whitespace."""
        text = text.lower()
        text = self._strip_accents(text)
        text = self._tokenize_chinese_chars(text)

        tokens = []
        for word in text.split():
            # Split on punctuation
            sub = self._split_on_punctuation(word)
            tokens.extend(sub)
        return [t for t in tokens if t.strip()]

    def _wordpiece_tokenize(self, word: str) -> list[str]:
        """WordPiece tokenization of a single word."""
        if word in self.vocab:
            return [word]

        tokens = []
        start = 0
        while start < len(word):
            end = len(word)
            found = None
            while start < end:
                substr = word[start:end]
                if start > 0:
                    substr = "##" + substr
                if substr in self.vocab:
                    found = substr
                    break
                end -= 1
            if found is None:
                tokens.append(UNK_TOKEN)
                break
            tokens.append(found)
            start = end
        return tokens

    @staticmethod
    def _strip_accents(text: str) -> str:
        output = []
        for char in unicodedata.normalize("NFD", text):
            if unicodedata.category(char) == "Mn":
                continue
            output.append(char)
        return "".join(output)

    @staticmethod
    def _tokenize_chinese_chars(text: str) -> str:
        """Add whitespace around CJK characters."""
        output = []
        for char in text:
            cp = ord(char)
            if (
                (0x4E00 <= cp <= 0x9FFF)
                or (0x3400 <= cp <= 0x4DBF)
                or (0x20000 <= cp <= 0x2A6DF)
                or (0x2A700 <= cp <= 0x2B73F)
                or (0x2B740 <= cp <= 0x2B81F)
                or (0x2B820 <= cp <= 0x2CEAF)
                or (0xF900 <= cp <= 0xFAFF)
                or (0x2F800 <= cp <= 0x2FA1F)
            ):
                output.append(f" {char} ")
            else:
                output.append(char)
        return "".join(output)

    @staticmethod
    def _split_on_punctuation(text: str) -> list[str]:
        """Split a word on punctuation characters."""
        tokens = []
        current = []
        for char in text:
            if _is_punctuation(char):
                if current:
                    tokens.append("".join(current))
                    current = []
                tokens.append(char)
            else:
                current.append(char)
        if current:
            tokens.append("".join(current))
        return tokens


def _is_punctuation(char: str) -> bool:
    """Check if a character is punctuation."""
    cp = ord(char)
    # ASCII punctuation
    if (33 <= cp <= 47) or (58 <= cp <= 64) or (91 <= cp <= 96) or (123 <= cp <= 126):
        return True
    cat = unicodedata.category(char)
    return cat.startswith("P")

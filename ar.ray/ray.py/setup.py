#!/usr/bin/env python3

from pathlib import Path
from setuptools import setup

directory = Path(__file__).resolve().parent
with open(directory / '../../README.md', encoding='utf-8') as f:
  long_description = f.read()

setup(
  name='orbitmines',
  version='4.2.0',
  description='A Universal Language: One Ray to rule them all, One Ray to find them, One Ray to bring them all, and in the darkness bind them.',
  author='Fadi Shawki',
  license='MIT',
  long_description=long_description,
  long_description_content_type='text/markdown',
  packages = ['orbitmines'],
  classifiers=[
    "Programming Language :: Python :: 3",
    "License :: OSI Approved :: MIT License"
  ],
  install_requires=[""],
  python_requires='>=3.8',
  extras_require={
    'linting': [
    ],
    'testing': [
    ]
  },
  include_package_data=True
)

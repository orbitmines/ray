#!/usr/bin/env python3

from pathlib import Path
from setuptools import setup

directory = Path(__file__).resolve().parent
with open(directory / '../../README.md', encoding='utf-8') as f:
  long_description = f.read()

setup(name='orbitmines',
      version='0.0.1',
      description='Once a Minecraft server, now a research project dedicated to understanding arbitrarily unknown dynamical systems.',
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
      include_package_data=True)

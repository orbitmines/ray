---
Website:
  - https://www.latex-project.org/
GitHub: https://github.com/latex3
Email:
  - latex-team@latex-project.org
---

---

- Install (https://www.tug.org/texlive/quickinstall.html)
	1. cd /tmp # working directory of your choice
	2. wget [https://mirror.ctan.org/systems/texlive/tlnet/install-tl-unx.tar.gz](https://mirror.ctan.org/systems/texlive/tlnet/install-tl-unx.tar.gz) # or curl instead of wget
	3. zcat < install-tl-unx.tar.gz | tar xf -
	4. cd install-tl-*
	5. perl ./install-tl --no-interaction # as root or with [writable destination](https://www.tug.org/texlive/quickinstall.html#running)
	6. Finally, prepend /usr/local/texlive/YYYY/bin/PLATFORM to your PATH,  
	    e.g., /usr/local/texlive/2023/bin/x86_64-linux
- Install `pdflatex` (https://gist.github.com/rain1024/98dd5e2c6c8c28f9ea9d)
```shell 
sudo apt-get install texlive-latex-base texlive-fonts-recommended texlive-fonts-extra texlive-latex-extra
		```
- Install all packages
```shell
sudo apt install texlive-full
```

export type Send = (line: string) => void;

const unescape = (text: string) => text.replace(/\\(n|\\)/g, (_, c) => (c === 'n' ? '\n' : '\\'));

export function host(root: HTMLElement, send: Send) {
  const nodes = new Map<number, HTMLElement>([[0, root]]);
  const at = (id: string) => nodes.get(Number(id));
  return (line: string) => {
    const [command, id, ...rest] = line.replace(/\n$/, '').split(' ');
    switch (command) {
      case 'clear':
        root.replaceChildren();
        nodes.clear();
        nodes.set(0, root);
        return;
      case 'create':
        nodes.set(Number(id), document.createElement(rest[0]));
        return;
      case 'text':
        at(id)!.textContent = unescape(rest.join(' '));
        return;
      case 'style':
        at(id)!.setAttribute('style', unescape(rest.join(' ')));
        return;
      case 'attribute':
        at(id)!.setAttribute(rest[0], unescape(rest.slice(1).join(' ')));
        return;
      case 'append':
        at(id)!.appendChild(at(rest[0])!);
        return;
      case 'listen':
        at(id)!.addEventListener(rest[0], () => send(`${id} ${rest[0]}\n`));
        return;
    }
  };
}

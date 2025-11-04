export const getDomPositionForOffset = (container: Node, charOffset: number): { node: Node; offset: number } | null => {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
  let current: Node | null = walker.nextNode();
  let traversed = 0;
  while (current) {
    const textContent = current.nodeValue || '';
    const nextTraversed = traversed + textContent.length;
    if (charOffset <= nextTraversed) {
      return { node: current, offset: Math.max(0, charOffset - traversed) };
    }
    traversed = nextTraversed;
    current = walker.nextNode();
  }
  return null;
};

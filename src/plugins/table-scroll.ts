// Wraps every markdown table in <div class="table-scroll"> so wide tables scroll sideways instead of widening the page.
import { visit } from 'unist-util-visit';
import type { Element, Root } from 'hast';

export function rehypeTableScroll() {
    return (tree: Root) => {
        visit(tree, 'element', (node: Element, index, parent) => {
            if (node.tagName !== 'table' || parent === undefined || index === undefined) {
                return;
            }
            const wrapper: Element = {
                type: 'element',
                tagName: 'div',
                properties: { className: ['table-scroll'] },
                children: [node],
            };
            parent.children[index] = wrapper;
            return 'skip';
        });
    };
}

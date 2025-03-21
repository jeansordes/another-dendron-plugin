import { App, Notice, TFile, setIcon } from 'obsidian';
import { Node, NodeType } from '../types';
import { t } from '../i18n';
import { basename } from '../utils/FileUtils';
export class TreeRenderer {
    private fileItemsMap: Map<string, HTMLElement>;
    private app: App;

    constructor(app: App, fileItemsMap: Map<string, HTMLElement>) {
        this.app = app;
        this.fileItemsMap = fileItemsMap;
    }

    /**
     * Render a node in the tree
     */
    renderDendronNode(node: Node, parentEl: HTMLElement, expandedNodes: Set<string>) {
        // Use DocumentFragment for batch DOM operations
        const fragment = document.createDocumentFragment();

        // Sort children by name and render each one
        Array.from(node.children.entries())
            .sort(([aKey], [bKey]) => aKey.localeCompare(bKey))
            .forEach(([name, childNode]) => {
                const hasChildren = childNode.children.size > 0;
                
                // Create tree item structure
                const item = this.createElement('div', {
                    className: `tree-item${!expandedNodes.has(name) ? ' is-collapsed' : ''}`,
                    attributes: { 'data-path': name }
                });

                const itemSelf = this.createElement('div', {
                    className: `tree-item-self${hasChildren ? ' mod-collapsible' : ''}`
                });
                item.appendChild(itemSelf);

                const contentWrapper = this.createElement('div', { className: 'tree-item-content' });
                itemSelf.appendChild(contentWrapper);

                // Add components to the tree item
                this.addToggleButton(contentWrapper, item, hasChildren, expandedNodes);
                
                if (childNode.nodeType === NodeType.FOLDER) {
                    this.addIcon(contentWrapper, 'folder', t('tooltipFolder'));
                }
                
                this.addNode(contentWrapper, childNode);
                this.addActionButtons(itemSelf, childNode, name);

                // Recursively render children
                if (hasChildren) {
                    const childrenContainer = this.createElement('div', { className: 'tree-item-children' });
                    item.appendChild(childrenContainer);
                    this.renderDendronNode(childNode, childrenContainer, expandedNodes);
                }

                fragment.appendChild(item);
            });

        parentEl.appendChild(fragment);
    }

    /**
     * Create an HTML element with specified options
     */
    private createElement(tag: string, options?: {
        className?: string,
        textContent?: string,
        attributes?: Record<string, string>,
        title?: string
    }): HTMLElement {
        const element = document.createElement(tag);
        
        if (options?.className) element.className = options.className;
        if (options?.textContent) element.textContent = options.textContent;
        if (options?.title) element.setAttribute('title', options.title);
        
        if (options?.attributes) {
            Object.entries(options.attributes).forEach(([key, value]) => {
                element.setAttribute(key, value);
            });
        }
        
        return element;
    }

    /**
     * Add toggle button or spacer for tree items
     */
    private addToggleButton(parent: HTMLElement, item: HTMLElement, hasChildren: boolean, expandedNodes: Set<string>): void {
        if (!hasChildren) {
            parent.appendChild(this.createElement('div', { className: 'tree-item-icon-spacer' }));
            return;
        }
        
        const toggleBtn = this.createElement('div', {
            className: 'tree-item-icon collapse-icon is-clickable'
        });
        parent.appendChild(toggleBtn);
        setIcon(toggleBtn, 'right-triangle');

        this.addEventHandler(toggleBtn, 'click', (event) => {
            event.stopPropagation();
            const isCollapsed = item.classList.toggle('is-collapsed');
            const path = item.getAttribute('data-path');
            
            if (path) {
                isCollapsed ? expandedNodes.delete(path) : expandedNodes.add(path);
            }

            const triangle = toggleBtn.querySelector('.right-triangle');
            if (triangle) triangle.classList.toggle('is-collapsed');
        });
    }

    /**
     * Add icon to an element
     */
    private addIcon(parent: HTMLElement, iconName: string, tooltip?: string): HTMLElement {
        const icon = this.createElement('div', {
            className: `tree-item-${iconName}-icon`,
            title: tooltip
        });
        parent.appendChild(icon);
        setIcon(icon, iconName);
        return icon;
    }

    /**
     * Add node with appropriate styling
     */
    private addNode(parent: HTMLElement, node: Node): void {
        const isFile = node.nodeType === NodeType.FILE;
        
        // Build class name and determine tooltip
        const className = [
            'tree-item-inner',
            node.nodeType === NodeType.VIRTUAL ? 'mod-create-new' : '',
            isFile ? 'is-clickable' : ''
        ].filter(Boolean).join(' ');

        // Create and append the name element
        const nameEl = this.createElement('div', {
            className,
            textContent: this.getNodeName(node),
            title: node.path
        });
        
        parent.appendChild(nameEl);

        // Add click handler and store reference for file items
        if (isFile) {
            this.addEventHandler(nameEl, 'click', async () => {
                if (node.obsidianResource && node.obsidianResource instanceof TFile) {
                    await this.openFile(node.obsidianResource);
                }
            });

            if (node.obsidianResource && node.obsidianResource instanceof TFile) {
                this.fileItemsMap.set(node.obsidianResource.path, nameEl);
            }
        }
    }

    private getNodeName(node: Node): string {
        if (node.nodeType === NodeType.FOLDER) {
            return basename(node.path);
        }
        return basename(node.path).match(/([^.]+)\.[^.]+$/)?.[1] || basename(node.path);
    }

    /**
     * Add event handler to an element
     */
    private addEventHandler(element: HTMLElement, event: string, handler: (event: Event) => void): void {
        element.addEventListener(event, handler);
    }

    /**
     * Add action buttons to a node
     */
    private addActionButtons(parent: HTMLElement, node: Node, name: string): void {
        const btnContainer = this.createElement('div', { className: 'tree-item-buttons-container' });
        parent.appendChild(btnContainer);

        // Add "create note" button for virtual nodes
        if (node.nodeType === NodeType.VIRTUAL) {
            btnContainer.appendChild(this.createActionButton({
                icon: 'square-pen',
                title: t('tooltipCreateNote', { path: node.path }),
                onClick: () => this.createNote(node.path)
            }));
        }

        // Add "create child note" button for all nodes
        btnContainer.appendChild(this.createActionButton({
            icon: 'rotate-cw-square',
            title: t('tooltipCreateChildNote', { path: this.getChildPath(node) }),
            className: 'rotate-180deg',
            onClick: () => this.createNote(this.getChildPath(node))
        }));
    }

    /**
     * Create an action button with icon and click handler
     */
    private createActionButton(options: {
        icon: string,
        title: string,
        className?: string,
        onClick: () => Promise<void> | void
    }): HTMLElement {
        const btn = this.createElement('div', {
            className: `tree-item-button ${options.className || ''} is-clickable`,
            title: options.title
        });
        
        setIcon(btn, options.icon);
        
        this.addEventHandler(btn, 'click', (event) => {
            event.stopPropagation();
            options.onClick();
        });
        
        return btn;
    }

    /**
     * Get the path for a child note
     */
    private getChildPath(node: Node): string {

        return node.path.replace(/\.md$/, '.' + t('untitledPath') + '.md');
    }

    /**
     * Create and open a note at the specified path
     */
    private async createNote(path: string): Promise<void> {
        let note = this.app.vault.getAbstractFileByPath(path);

        if (!note) {
            try {
                note = await this.app.vault.create(path, '');
                new Notice(t('noticeCreatedNote', { path }));
            } catch (error) {
                new Notice(t('noticeFailedCreateNote', { path }));
                return;
            }
        }

        if (note instanceof TFile) {
            await this.openFile(note);
        }
    }

    /**
     * Open a file in a new leaf
     */
    private async openFile(file: TFile): Promise<void> {
        const leaf = this.app.workspace.getLeaf(false);
        if (leaf) {
            await leaf.openFile(file);
        }
    }
}

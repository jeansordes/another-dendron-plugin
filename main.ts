import { App, Modal, Notice, Plugin, TFile, ViewState, WorkspaceLeaf } from 'obsidian';
import { FILE_TREE_VIEW_TYPE, PluginSettings, DEFAULT_SETTINGS, TREE_VIEW_ICON } from './src/models/types';
import DendronTreeView from './src/views/DendronTreeView';
import { t } from './src/i18n';

export default class TreeMapperPlugin extends Plugin {
	settings: PluginSettings;
	private viewRegistered = false;
	private isInitializing = false;
	private dendronView: DendronTreeView | null = null;

	async onload() {
		await this.loadSettings();

		// Always unregister the view type first to ensure clean registration
		try {
			this.app.workspace.detachLeavesOfType(FILE_TREE_VIEW_TYPE);
		} catch (e) {
			// This is normal if it's the first load
		}

		// Register the file tree view
		this.registerView(
			FILE_TREE_VIEW_TYPE,
			(leaf) => {
				this.dendronView = new DendronTreeView(leaf, this.settings);
				return this.dendronView;
			}
		);
		this.viewRegistered = true;

		// Add a ribbon icon to open the file tree view
		this.addRibbonIcon(TREE_VIEW_ICON, t('ribbonTooltip'), (evt: MouseEvent) => {
			this.activateView();
		});

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'open-file-tree-view',
			name: t('commandOpenTree'),
			callback: () => {
				this.activateView();
			}
		});

		// Add a command to show the current file in the Dendron Tree View
		this.addCommand({
			id: 'show-file-in-dendron-tree',
			name: t('commandShowFile'),
			checkCallback: (checking: boolean) => {
				// Only enable the command if there's an active file
				const activeFile = this.app.workspace.getActiveFile();
				if (!activeFile) return false;
				
				if (!checking) {
					this.showFileInDendronTree(activeFile);
				}
				
				return true;
			}
		});

		// Add a command to collapse all nodes
		this.addCommand({
			id: 'collapse-all-dendron-tree',
			name: t('commandCollapseAll'),
			callback: () => {
				if (this.dendronView) {
					this.dendronView.collapseAllNodes();
				}
			}
		});

		// Add a command to expand all nodes
		this.addCommand({
			id: 'expand-all-dendron-tree',
			name: t('commandExpandAll'),
			callback: () => {
				if (this.dendronView) {
					this.dendronView.expandAllNodes();
				}
			}
		});

		// Use a timeout to ensure we don't initialize too early
        // and create a new leaf before checking for existing leaves
        // resulting in a race condition, with 2 leaves created in the end
		setTimeout(() => {
			this.app.workspace.onLayoutReady(() => {
				this.checkAndInitializeView();
			});
		}, 500);
	}

	private async checkAndInitializeView() {
		// Check for leaves with our view type
		const leaves = this.app.workspace.getLeavesOfType(FILE_TREE_VIEW_TYPE);
		
		// If we already have a leaf with our view type, don't create another one
		if (leaves.length > 0) {
			// Highlight the active file in the existing view
			this.highlightActiveFileInView(leaves[0]);
			return;
		}
		
		// Check for any leaves that might have our view type but are not properly initialized
		const allLeaves = this.app.workspace.getLeavesOfType('');
		
		// Find any leaves that might be our view but not properly registered
		const potentialDendronLeaves = allLeaves.filter(leaf => 
			leaf.view?.containerEl?.querySelector('.dendron-tree-container') !== null
		);
		
		if (potentialDendronLeaves.length > 0) {
			for (const leaf of potentialDendronLeaves) {
				await leaf.setViewState({
					type: FILE_TREE_VIEW_TYPE,
					active: false
				} as ViewState);
			}
			// Highlight the active file after reregistering the view
			if (potentialDendronLeaves.length > 0) {
				this.highlightActiveFileInView(potentialDendronLeaves[0]);
			}
			return;
		}
		
		// If no existing leaves are found, create a new one
		const newLeaf = await this.initLeaf();
		if (newLeaf) {
			this.highlightActiveFileInView(newLeaf);
		}
	}

	async initLeaf(): Promise<WorkspaceLeaf | null> {
		// Set flag to indicate we're initializing
		this.isInitializing = true;
		
		try {
			// Always create the view in the left panel
			const leaf = this.app.workspace.getLeftLeaf(false);
			if (!leaf) return null;
			
			// Set the view state
			await leaf.setViewState({
				type: FILE_TREE_VIEW_TYPE,
				active: false // Set to false to avoid automatically focusing the view
			} as ViewState);
			
			return leaf;
		} finally {
			// Reset the flag
			this.isInitializing = false;
		}
	}

	async activateView() {
		// If the view is already open, reveal it
		const existing = this.app.workspace.getLeavesOfType(FILE_TREE_VIEW_TYPE);
		
		if (existing.length > 0) {
			this.app.workspace.revealLeaf(existing[0]);
			return;
		}

		// Otherwise, create a new leaf in the left sidebar
		const leaf = this.app.workspace.getLeftLeaf(false);
		if (leaf) {
			await leaf.setViewState({
				type: FILE_TREE_VIEW_TYPE,
				active: true
			} as ViewState);
			this.app.workspace.revealLeaf(leaf);
		}
	}

	/**
	 * Show the current file in the Dendron Tree View
	 */
	private async showFileInDendronTree(file: TFile): Promise<void> {
		// First, make sure the view is open
		await this.activateView();
		
		// Get the Dendron Tree View instance
		const leaves = this.app.workspace.getLeavesOfType(FILE_TREE_VIEW_TYPE);
		if (leaves.length === 0) return;
		
		const dendronView = leaves[0].view as DendronTreeView;
		
		// Trigger file highlighting
		if (dendronView && typeof dendronView.highlightFile === 'function') {
			dendronView.highlightFile(file);
		}
	}

	/**
	 * Highlight the active file in the specified view
	 */
	private highlightActiveFileInView(leaf: WorkspaceLeaf): void {
		// Get the active file
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) return;
		
		// Get the Dendron Tree View instance
		const dendronView = leaf.view as DendronTreeView;
		
		// Trigger file highlighting
		if (dendronView && typeof dendronView.highlightFile === 'function') {
			// Use a small timeout to ensure the view is fully rendered
			setTimeout(() => {
				dendronView.highlightFile(activeFile);
			}, 100);
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		
		// Restore expanded nodes if available
		if (this.dendronView && this.settings.expandedNodes) {
			this.dendronView.restoreExpandedNodesFromSettings(this.settings.expandedNodes);
		}
	}

	async saveSettings() {
		// Save expanded nodes state if available
		if (this.dendronView) {
			this.settings.expandedNodes = this.dendronView.getExpandedNodesForSettings();
		}
		
		await this.saveData(this.settings);
	}

	onunload() {
		// Save settings before unloading
		this.saveSettings();
	}
}